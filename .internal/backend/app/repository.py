"""
MovieRepository — Thread-safe, in-memory data access layer.

This is the single source of truth for all movie data in the application.
It encapsulates the raw record store (Dict[movie_id → MovieRecord]) along
with three custom index structures:

  1. Trie           — prefix-based title autocomplete
  2. InvertedIndex  — genre/year term → movie_id set for O(1) filter lookups
  3. Counter        — genre frequency counter for top-K genre queries
  4. TopRatedHeap   — max-heap for top-K rated movie queries

Concurrency Model:
  FastAPI runs on a single-threaded asyncio event loop with cooperative
  multitasking. Writes (add_movie) acquire an asyncio.Lock to prevent
  interleaving of coroutine switches during multi-structure updates.
  Reads are lock-free because:
    (a) Python dict/list reads are GIL-atomic at the bytecode level, and
    (b) asyncio tasks never preempt each other mid-bytecode-instruction.

  If this service were ever migrated to a multi-worker deployment (e.g.,
  Gunicorn with multiple processes), the lock would need to be replaced
  with a multiprocessing-safe primitive. For the current single-process
  uvicorn deployment, asyncio.Lock is correct and sufficient.
"""

from __future__ import annotations

import logging
import asyncio
import heapq
import math
import time
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from app.api.schemas import MovieRecord


logger = logging.getLogger("netflix.repository")


# ═══════════════════════════════════════════════════════════════════
# 1. Trie — Prefix Search for Movie Titles
# ═══════════════════════════════════════════════════════════════════


class TrieNode:
    """
    A single node in the Trie.

    Attributes:
        children: Map of character → child TrieNode.
        is_end_of_word: True if this node marks the end of a complete title.
        movie_ids: Movie IDs whose titles terminate at this node.
                   Stored as a list rather than a set to preserve insertion order,
                   which naturally approximates recency-based ranking.
    """

    __slots__ = ("children", "is_end_of_word", "movie_ids")

    def __init__(self) -> None:
        self.children: Dict[str, TrieNode] = {}
        self.is_end_of_word: bool = False
        self.movie_ids: List[str] = []


class Trie:
    """
    A Trie (prefix tree) for storing normalized movie titles.

    Insert: O(L) where L = length of the title string.
    Search by prefix: O(P + M) where P = prefix length, M = number of matches
    collected beneath the prefix node.

    Titles are lowercased and stripped before insertion to ensure
    case-insensitive prefix matching.
    """

    def __init__(self) -> None:
        self._root = TrieNode()
        self._size: int = 0  # Total words inserted

    @property
    def size(self) -> int:
        """Number of titles stored in the Trie."""
        return self._size

    def insert(self, title: str, movie_id: str) -> None:
        """
        Insert a movie title into the Trie.

        Args:
            title: The movie title (will be lowercased for matching).
            movie_id: Unique identifier for the movie record.
        """
        key = title.lower().strip()
        if not key:
            return

        node = self._root
        for char in key:
            if char not in node.children:
                node.children[char] = TrieNode()
            node = node.children[char]

        node.is_end_of_word = True
        node.movie_ids.append(movie_id)
        self._size += 1

    def search_prefix(self, prefix: str, max_results: int = 50) -> List[str]:
        """
        Find all movie_ids whose titles start with the given prefix.

        Args:
            prefix: The search prefix (case-insensitive).
            max_results: Cap the returned IDs to avoid unbounded scans.

        Returns:
            List of movie_ids matching the prefix, up to max_results.
        """
        key = prefix.lower().strip()
        if not key:
            return []

        # ── Navigate to the prefix node ───────────────────────────
        node = self._root
        for char in key:
            if char not in node.children:
                return []  # No titles with this prefix
            node = node.children[char]

        # ── Collect all movie_ids under this subtree via DFS ──────
        results: List[str] = []
        self._collect_ids(node, results, max_results)
        return results

    def _collect_ids(
        self, node: TrieNode, results: List[str], limit: int
    ) -> None:
        """DFS traversal to collect movie_ids from terminal nodes."""
        if len(results) >= limit:
            return

        if node.is_end_of_word:
            results.extend(node.movie_ids[:limit - len(results)])

        for child in node.children.values():
            if len(results) >= limit:
                break
            self._collect_ids(child, results, limit)

    

# ═══════════════════════════════════════════════════════════════════
# 2. TopRatedHeap
# ═══════════════════════════════════════════════════════════════════

class TopRatedHeap:
    """
    Maintains a sorted view of the highest-rated movies.

    Internally uses a bounded min-heap to allow O(log K) insertion
    and O(K) space for the top-K rated movies.
    """

    def __init__(self, max_size: int = 10) -> None:
        self._heap: List[Tuple[float, str]] = []  # Min-heap: (rating, movie_id)
        self._max_size = max_size

    @property
    def size(self) -> int:
        return len(self._heap)

    def push(self, movie_id: str, rating: float) -> None:
        """
        Add a movie to the rated heap.

        Args:
            movie_id: Unique movie identifier.
            rating: The movie's rating (0–10 scale).
        """
        # Maintain a bounded min-heap of the top `max_size` ratings
        if len(self._heap) < self._max_size:
            heapq.heappush(self._heap, (rating, movie_id))
        elif rating > self._heap[0][0]:
            heapq.heapreplace(self._heap, (rating, movie_id))

    def top_k(self, k: int = 10) -> List[Tuple[str, float]]:
        """
        Return the top-K highest-rated movie_ids with their ratings.

        Complexity: O(K log K) via sort. Space is O(K).

        Returns:
            List of (movie_id, rating) tuples, sorted descending by rating.
        """
        # Sort descending to return highest rated first
        sorted_top = sorted(self._heap, reverse=True)
        return [(movie_id, rating) for rating, movie_id in sorted_top[:k]]


class MovieRepository:
    """
    In-memory movie store with indexed access patterns.

    All public methods are async to fit naturally into the FastAPI request
    lifecycle. Write methods acquire the internal lock; read methods do not.
    """

    def __init__(self) -> None:
        # ── Primary Store ─────────────────────────────────────────
        self._records: Dict[str, MovieRecord] = {}

        # ── Index Structures ──────────────────────────────────────
        self._trie = Trie()
        self._inverted_index: Dict[str, Set[str]] = defaultdict(set)
        self._genre_counter: Counter[str] = Counter()
        self._rating_heap = TopRatedHeap()

        # ── Aggregation Caches ────────────────────────────────────
        self._total_rating_sum: float = 0.0
        self._rated_count: int = 0
        self._year_counts: Dict[int, int] = {}
        self._title_year_mapping: Dict[Tuple[str, Optional[int]], str] = {}

        # ── Concurrency Control ───────────────────────────────────
        self._lock = asyncio.Lock()
        self.is_ingesting: bool = True
        self.ingestion_logs: List[str] = []

        logger.info("MovieRepository initialized (empty)")

    # ═══════════════════════════════════════════════════════════════
    # Write Operations (event-loop safe — see concurrency note above)
    # ═══════════════════════════════════════════════════════════════

    async def add_movie(self, movie: MovieRecord) -> MovieRecord:
        """
        Atomically ingest a movie into all underlying structures.
        If a movie with the same title and year already exists, 
        returns the existing record instead of creating a duplicate.

        Args:
            movie: A validated MovieRecord to add.
            
        Returns:
            The stored MovieRecord (either the new one or an existing one).
        """
        start_time = time.perf_counter()
        async with self._lock:
            wait_time = (time.perf_counter() - start_time) * 1000
            if wait_time > 50:
                logger.warning("Repository lock acquisition delayed: %.2fms", wait_time)
            
            # O(1) check for existing movie with same title and year to avoid duplication
            normalized_title = movie.title.lower().strip()
            existing_id = self._title_year_mapping.get((normalized_title, movie.year))
            if existing_id:
                existing = self._records.get(existing_id)
                if existing:
                    logger.info("Movie already exists: %r (%s). Returning existing record.", existing.title, existing.year)
                    return existing
            
            self._add_movie_unsafe(movie)
            return movie

    async def add_movies_bulk(self, movies: List[MovieRecord]) -> int:
        """
        Bulk-add movies.

        Args:
            movies: List of validated MovieRecords.

        Returns:
            Number of movies successfully added (skips duplicates).
        """
        start_time = time.perf_counter()
        async with self._lock:
            wait_time = (time.perf_counter() - start_time) * 1000
            if wait_time > 50:
                logger.warning("Repository lock acquisition (bulk) delayed: %.2fms", wait_time)
                
            added = 0
            for movie in movies:
                normalized_title = movie.title.lower().strip()
                if (normalized_title, movie.year) not in self._title_year_mapping:
                    self._add_movie_unsafe(movie)
                    added += 1
            
            execution_time = (time.perf_counter() - start_time) * 1000
            logger.info(
                "Bulk ingested %d movies (skipped %d duplicates) in %.2fms", 
                added, len(movies) - added, execution_time
            )
            return added

    def _add_movie_unsafe(self, movie: MovieRecord) -> None:
        """
        Internal method that performs the actual insertion.

        Updates:
          1. Primary record store
          2. Title/Year index for duplicate checking
          3. Trie (title → movie_id)
          4. Inverted index (genre:X, year:Y → movie_id)
          5. Genre frequency counter
          6. Rating heap
          7. Aggregation caches (rating sum, year counts)
        """
        # ── 1. Primary store ──────────────────────────────────────
        if movie.id in self._records:
            return  # Idempotent — skip duplicates silently
        
        normalized_title = movie.title.lower().strip()
        if (normalized_title, movie.year) in self._title_year_mapping:
            return # Secondary check for bulk ingestion
            
        self._records[movie.id] = movie
        self._title_year_mapping[(normalized_title, movie.year)] = movie.id

        # ── 2. Trie — title autocomplete ──────────────────────────
        self._trie.insert(movie.title, movie.id)

        # ── 3. Inverted index — genre + year terms ────────────────
        for genre in movie.genre:
            normalized_genre = genre.lower().strip()
            self._inverted_index[f"genre:{normalized_genre}"].add(movie.id)
            self._genre_counter[normalized_genre] += 1

        if movie.year is not None:
            self._inverted_index[f"year:{movie.year}"].add(movie.id)
            self._year_counts[movie.year] = self._year_counts.get(movie.year, 0) + 1

        # ── 4. Rating heap + running sum ──────────────────────────
        if movie.rating is not None:
            rating_bucket = max(0, min(100, int(math.floor(movie.rating * 10))))
            self._inverted_index[f"rating_bucket:{rating_bucket}"].add(movie.id)
            self._rating_heap.push(movie.id, movie.rating)
            self._total_rating_sum += movie.rating
            self._rated_count += 1

        # ── 5. Index extra fields (director, etc.) if present ─────
        director = movie.extra_fields.get("director") or movie.extra_fields.get("directors")
        if director:
            if isinstance(director, str):
                self._inverted_index[f"director:{director.lower().strip()}"].add(movie.id)
            elif isinstance(director, list):
                for d in director:
                    if isinstance(d, str):
                        self._inverted_index[f"director:{d.lower().strip()}"].add(movie.id)

    # ═══════════════════════════════════════════════════════════════
    # Read Operations (lock-free)
    # ═══════════════════════════════════════════════════════════════

    async def get_movie(self, movie_id: str) -> Optional[MovieRecord]:
        """Retrieve a single movie by ID. O(1)."""
        return self._records.get(movie_id)

    async def search_titles(self, prefix: str, max_results: int = 20) -> List[MovieRecord]:
        """
        Prefix search — returns movies whose titles start with the prefix.

        Complexity: O(P + M) where P = prefix length, M = number of matches.
        High performance for autocomplete scenarios.

        Args:
            prefix: The search prefix (case-insensitive).
            max_results: Maximum number of records to return.

        Returns:
            List of matching MovieRecords.
        """
        if not prefix or not prefix.strip():
            return []

        ids = self._trie.search_prefix(prefix, max_results=max_results)
        return [self._records[mid] for mid in ids if mid in self._records]

    async def filter_movies(
        self,
        genres: Optional[List[str]] = None,
        min_rating: Optional[float] = None,
        year: Optional[List[int]] = None,
        title: Optional[str] = None,
        max_results: int = 100,
    ) -> List[MovieRecord]:
        """
        Multi-criteria filter using the inverted index.

        Each filter criterion maps to an O(1) set lookup in the inverted
        index. Multiple criteria are combined via set intersection.

        Args:
            genres: Filter by one or more genres (AND logic within genres).
            min_rating: Minimum rating threshold (post-filter on records).
            year: Exact release year.
            max_results: Cap on returned records.

        Returns:
            List of MovieRecords matching all supplied criteria.
        """
        candidate_ids = self._candidate_ids_from_filters(
            genres=genres,
            min_rating=min_rating,
            year=year,
            title=title,
        )

        # ── Post-filter: min_rating & deterministic sorting ────────
        candidates = [
            self._records[mid] for mid in candidate_ids 
            if mid in self._records and (min_rating is None or (self._records[mid].rating is not None and self._records[mid].rating >= min_rating))
        ]

        # Sort by rating (desc) then title (asc) to ensure consistent results
        return heapq.nsmallest(
            max_results,
            candidates,
            key=lambda m: (-m.rating if m.rating is not None else 0, m.title)
        )

    def _candidate_ids_from_filters(
        self,
        genres: Optional[List[str]] = None,
        min_rating: Optional[float] = None,
        year: Optional[List[int]] = None,
        title: Optional[str] = None,
    ) -> Set[str]:
        """
        Build candidate IDs entirely through indexed lookups and set operations.
        """
        candidate_sets: List[Set[str]] = []

        if title:
            prefix_ids = set(self._trie.search_prefix(title, max_results=100))
            candidate_sets.append(prefix_ids)

        if genres:
            for genre in genres:
                term = f"genre:{genre.lower().strip()}"
                candidate_sets.append(self._inverted_index.get(term, set()))

        if year is not None and len(year) > 0:
            year_ids = set()
            for y in year:
                year_ids.update(self._inverted_index.get(f"year:{y}", set()))
            candidate_sets.append(year_ids)

        if min_rating is not None:
            min_bucket = max(0, min(100, int(math.ceil(min_rating * 10))))
            rating_ids: Set[str] = set()
            for bucket in range(min_bucket, 101):
                rating_ids.update(self._inverted_index.get(f"rating_bucket:{bucket}", set()))
            candidate_sets.append(rating_ids)

        if candidate_sets:
            # Edge Case: If any filter returned 0 results, the intersection is empty.
            if not all(candidate_sets):
                return set()
            
            # Algorithmic Optimization: Sort candidate sets by length (smallest first).
            # This minimizes the number of comparisons during the intersection process
            # (O(N) where N is the size of the smallest set).
            candidate_sets.sort(key=len)
            return set.intersection(*candidate_sets)

        return set(self._records.keys())


    async def get_top_rated_movies(self, k: int = 10) -> List[MovieRecord]:
        """
        Return the K highest-rated movies.

        Complexity: O(K log N) via heap extraction.

        Returns:
            List of MovieRecords, sorted descending by rating.
        """
        top_entries = self._rating_heap.top_k(k)
        results: List[MovieRecord] = []
        for movie_id, _rating in top_entries:
            movie = self._records.get(movie_id)
            if movie:
                results.append(movie)
        return results

    async def get_stats(self) -> Dict[str, Any]:
        """
        Return aggregate statistics about the movie collection.

        Returns:
            Dictionary matching StatsResponse shape.
        """
        avg_rating = (
            round(self._total_rating_sum / self._rated_count, 2)
            if self._rated_count > 0
            else 0.0
        )

        top_genres = [
            {"genre": name.title(), "count": count} 
            for name, count in self._genre_counter.most_common(5)
        ]
        
        top_rated = await self.get_top_rated_movies(k=10)

        return {
            "total_movies": len(self._records),
            "average_rating": avg_rating,
            "rated_count": self._rated_count,
            "total_genres": len(self._genre_counter),
            "top_genres": top_genres,
            "year_distribution": {str(y): c for y, c in sorted(self._year_counts.items())},
            "top_rated_movies": top_rated,
        }

    async def get_filtered_stats(
        self,
        genres: Optional[List[str]] = None,
        min_rating: Optional[float] = None,
        year: Optional[List[int]] = None,
        title: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Aggregate dashboard stats scoped to filtered candidates.
        """
        candidate_ids = self._candidate_ids_from_filters(
            genres=genres,
            min_rating=min_rating,
            year=year,
            title=title,
        )
        return self._calculate_stats_from_ids(candidate_ids)

    def _calculate_stats_from_ids(self, candidate_ids: Set[str]) -> Dict[str, Any]:
        """Shared aggregation logic for statistics over a specific set of IDs."""
        if not candidate_ids:
            return {
                "total_movies": 0,
                "average_rating": 0.0,
                "rated_count": 0,
                "total_genres": 0,
                "top_genres": [],
                "year_distribution": {},
                "top_rated_movies": [],
            }

        genre_counter: Counter[str] = Counter()
        year_counts: Dict[str, int] = {}
        rated_sum = 0.0
        rated_count = 0
        rated_movies: List[MovieRecord] = []

        for movie_id in candidate_ids:
            movie = self._records.get(movie_id)
            if not movie:
                continue

            for genre in movie.genre:
                genre_counter[genre.title()] += 1

            if movie.year is not None:
                year_key = str(movie.year)
                year_counts[year_key] = year_counts.get(year_key, 0) + 1

            if movie.rating is not None:
                rated_sum += movie.rating
                rated_count += 1
                rated_movies.append(movie)

        top_rated_movies = sorted(
            rated_movies,
            key=lambda m: (m.rating if m.rating is not None else 0.0, m.title),
            reverse=True,
        )[:10]

        return {
            "total_movies": len(candidate_ids),
            "average_rating": round(rated_sum / rated_count, 2) if rated_count else 0.0,
            "rated_count": rated_count,
            "total_genres": len(genre_counter),
            "top_genres": [
                {"genre": genre, "count": count}
                for genre, count in genre_counter.most_common(5)
            ],
            "year_distribution": dict(sorted(year_counts.items(), key=lambda x: int(x[0]))),
            "top_rated_movies": top_rated_movies,
        }

    @property
    def total_movies(self) -> int:
        """Total number of movies in the repository."""
        return len(self._records)
