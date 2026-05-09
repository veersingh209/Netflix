# 🎬 Netflix Movie Library Explorer

A high-performance, full-stack application architected for a **Staff Software Engineer 4** technical assessment. This explorer demonstrates advanced algorithmic design, resilient service integration, and a premium, responsive UI that honors the Netflix brand aesthetic.

---

## 🚀 Experience the App

This project is optimized for a seamless, one-click experience on macOS.

### Quick Start
1.  **Download:** Grab the latest `Netflix Explorer.app.zip` from the [Releases](../../releases) section.
2.  **Launch:** Unzip and double-click the **Netflix Explorer.app**.
3.  **Initialize:** The system will start a branded splash screen while the high-performance engine hydrates the in-memory data store.
4.  **Explore:** Your library will automatically open in your default browser once the services are healthy.

### Operational Controls
*   **Shutdown:** Click the ⏻ (Power) button in the application header or use the hidden `.Stop Netflix Explorer.command` utility.
*   **Portability:** The application is entirely self-contained. It requires **Node.js 18+** to be installed on the host system.

---

## 🛠️ Engineering Highlights

### Core Architecture
*   **In-Memory Computational Engine:** Designed for $O(1)$ amortized lookup performance.
    *   **Inverted Index:** Powers complex multi-term filtering (Genre + Year + Rating).
    *   **O(1) Duplicate Mapping:** Employs a title-year hash-map for instantaneous collision detection during ingestion.
    *   **Custom Trie:** Enables lightning-fast, case-insensitive autocomplete prefix search ($O(L)$).
    *   **Min/Max Heaps:** Maintains real-time analytical statistics for the dashboard.
*   **Resilient AI Gateway:** A provider-agnostic abstraction layer that translates natural language queries into structured API parameters.
    *   **Multi-Provider Support:** OpenAI, Anthropic (Claude), Gemini, Ollama, and OpenRouter.
    *   **Circuit Breaking:** Implements a state-machine based circuit breaker to prevent cascade failures.
*   **Intelligent Ingestion:** Recursive Google Drive synchronization with folder-context metadata inference and exponential backoff for API rate-limit resilience.

### Frontend Excellence
*   **Premium Glassmorphism:** A bespoke design system built with pure Vanilla CSS, utilizing modern CSS features like Backdrop Filters and Hoisted Variables.
*   **Modular React Architecture:** Strictly follows the "Container/Presentational" pattern with complex business logic encapsulated in custom Domain Hooks.
*   **Type Safety:** 100% TypeScript coverage with zero `any` types, ensuring robust state management across the application.

---

## 📂 Project Structure

```text
Netflix/
├── [Downloadable] .app/   # macOS Bundle (Available in Releases)
├── README.md                # Unified Technical Documentation
├── Netflix_API.postman_collection.json # API Testing Suite
├── .internal/               # Application Source (Hidden)
│   ├── backend/             # FastAPI High-Performance Engine
│   │   ├── app/            # Application Logic
│   │   │   ├── api/        # REST Contracts & Schemas
│   │   │   ├── services/   # AI, Ingestion, & TMDB Services
│   │   │   ├── repository.py # In-memory Movie Repository
│   │   │   └── main.py     # FastAPI Entry Point
│   │   └── venv/           # Python Virtual Environment
│   └── frontend/           # React 19 / Vite / TS Frontend
│       ├── src/           # Component Source & Hooks
│       │   ├── hooks/     # Domain-specific Business Logic
│       │   ├── components/ # Atomic & Feature-based Components
│       │   └── index.css  # Global Design System
│       └── package.json   # Frontend Dependency Management
└── .launch.sh               # Master Startup Orchestrator (Hidden)
```

---

## 🔍 Developer Setup

For developers wishing to run services manually for debugging:

### 1. Backend Service
```bash
cd .internal/backend
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8002
```

### 2. Frontend Development
```bash
cd .internal/frontend
npm install
npm run dev
# Accessible at http://localhost:7173
```

---

## 🧪 API Validation

A comprehensive Postman collection is included for rapid API exploration:
*   **Import:** `Netflix_API.postman_collection.json` into Postman.
*   **Test:** Validate In-memory Trie search, AI Magic Search, and real-time Library Stats.

---

## 📝 Design Rationale

1.  **Read-Optimized Engine:** Prioritized sub-millisecond query response times over persistent disk storage to demonstrate mastery of complex data structures.
2.  **Pure CSS Design:** Explicitly avoided Tailwind or external UI libraries to showcase custom styling capability and complete control over the design system tokens.
3.  **Circuit-Breaker Pattern:** Implemented to ensure the core application remains 100% functional even during global AI provider outages.

---