# SecureShip Architecture Diagrams

Regenerated against the real implementation (the build we chose: **HTTP transport + Podman with
Ollama on the host**). These reflect the actual code, not the spec templates: identity collection
and 2FA are driven by the backend state machine (not model tool calls), the model's only tool is
`lookup_shipments`, and session state lives in the Postgres `ChatSession` row (there is no separate
in-memory store). The WebSocket (6.3b) and fully-containerized-Ollama (6.5 bonus) variants are
intentionally omitted - they live in `docs/project-requirements.md` if needed.

## 1. High-level system architecture (6.1)

```mermaid
flowchart TB
    subgraph Client["Browser / Frontend (React)"]
        UI[Chat Window UI]
        Modal["6-digit Code Modal<br/>(rendered on demand)"]
        AdminUI[Admin Panel UI]
    end

    subgraph Backend["Backend API (FastAPI)"]
        ChatAPI["/chat endpoint (HTTP)"]
        VerifyAPI["/verify-code endpoint"]
        AdminAPI["/admin/* endpoints"]
        StateMachine["Chat state machine (main.py)<br/>intent + identity extraction"]
        Verify["Verification (verification.py)<br/>identity match, code issue/verify"]
        ToolLayer["Tool Layer (tools.py)<br/>gating enforcement point -<br/>lookup_shipments scoped to session.customer_id"]
        AuthMW["require_admin (auth.py)<br/>Auth0 token validation"]
    end

    subgraph LocalLLM["Local LLM Runtime (host)"]
        Ollama["Ollama Server<br/>(host.containers.internal:11434)"]
        Model["qwen3:8b"]
    end

    subgraph DataLayer["Data Layer (Postgres)"]
        DB[("Customers / Shipments / Packages")]
        ChatDB[("ChatSession rows<br/>state + transcript (JSONB)")]
        SMSMock["Mock SMS (console/log)"]
    end

    subgraph IdP["Identity Provider"]
        Auth0["Auth0 (admin login ONLY)"]
    end

    UI -->|"user message"| ChatAPI
    ChatAPI --> StateMachine
    StateMachine <-->|"load/save session"| ChatDB
    StateMachine -->|"classify intent / extract identity"| Ollama
    StateMachine -->|"match identity, issue code"| Verify
    Verify -->|"mocked code"| SMSMock
    StateMachine -->|"if verified: model + lookup tool"| ToolLayer
    ToolLayer -->|"scoped to session.customer_id"| DB
    Ollama --> Model
    UI -->|"on verification step"| Modal
    Modal -->|"submit code"| VerifyAPI
    VerifyAPI --> Verify

    AdminUI -->|"login redirect"| Auth0
    Auth0 -->|"access token (JWT)"| AdminUI
    AdminUI -->|"requests + Bearer token"| AdminAPI
    AdminAPI --> AuthMW
    AuthMW -->|"validated"| DB

    style ToolLayer fill:#ffe6cc,stroke:#d79b00,stroke-width:2px
    style AuthMW fill:#ffe6cc,stroke:#d79b00,stroke-width:2px
```

## 2. Conversation / identity-gating state machine (6.2)

The contract the backend enforces. These are the actual persisted states
(`verification.py`): `anonymous`, `collecting_identity`, `code_sent`, `verified`,
`escalated_to_human`. A non-matching identity is a neutral reject that stays in
`collecting_identity`; an expired or locked-out code drops back to `collecting_identity`
(there is no separate `IdentityRejected` / `AwaitingCode` / `CodeExpired` state).

```mermaid
stateDiagram-v2
    [*] --> Anonymous

    Anonymous --> Anonymous: General chat / FAQ
    Anonymous --> CollectingIdentity: Asks about a shipment

    CollectingIdentity --> CollectingIdentity: Partial info / no match (neutral reject) / off-topic question answered
    CollectingIdentity --> CodeSent: Full info matches a customer

    CodeSent --> CodeSent: Incorrect code (attempts remain) / off-topic question answered (code box stays)
    CodeSent --> Verified: Correct code (POST /verify-code)
    CodeSent --> CollectingIdentity: Too many attempts OR code expired

    Verified --> Verified: Shipment queries scoped to verified customer_id ONLY
    Verified --> [*]: Session ends

    Anonymous --> Escalated: "talk to a human"
    Verified --> Escalated: "talk to a human"
    Escalated --> Anonymous: resumes prior gating (was anonymous)
    Escalated --> Verified: resumes prior gating (was verified)
```

## 2b. Human escalation sequence (6.2b, Epic G - cosmetic)

```mermaid
stateDiagram-v2
    state "Anonymous (6.2)" as Anon
    state "Verified (6.2)" as Ver

    Anon --> EscalationRequested: "I want to talk to a human"
    Ver --> EscalationRequested: "I want to talk to a human"

    EscalationRequested --> ScriptedHandoff: Trigger scripted sequence

    state ScriptedHandoff {
        [*] --> Acknowledging
        Acknowledging --> ColorShift: Chat window changes color
        ColorShift --> HumanJoined: "Natalie has entered the chat"
        HumanJoined --> ReadingUp
        ReadingUp --> Greeting: "Hey [first_name if known]..."
        Greeting --> [*]
    }

    ScriptedHandoff --> Anon: returns to Anonymous gating rules
    ScriptedHandoff --> Ver: returns to Verified gating rules
```

## 3. Tool-calling sequence - HTTP (6.3, the gating enforcement point)

Identity collection and 2FA are backend-driven (intent classification + identity extraction +
`match_customer`), not model tool calls. The model is handed exactly one tool, `lookup_shipments`,
and only in the verified branch. A turn that contains a tracking number or "list all" phrasing
calls `run_tool` directly without the model, but the model-tool path below is the representative
case.

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant BE as Backend (main.py state machine)
    participant LLM as Local LLM (Ollama)
    participant Verify as Verification (verification.py)
    participant Tools as Tool Layer (tools.py)
    participant DB as Postgres

    User->>FE: "Where's my package?"
    FE->>BE: POST /chat {message, session_id}
    BE->>LLM: classify intent (latest message)
    LLM-->>BE: wants_shipment = true
    Note over BE: state Anonymous -> CollectingIdentity
    BE->>FE: assistant asks for name/address/phone

    User->>FE: provides name, address, phone
    FE->>BE: POST /chat {message, session_id}
    BE->>LLM: extract identity from transcript
    LLM-->>BE: {first_name, last_name, address, phone}
    BE->>Verify: match_customer(last_name, phone)
    Verify->>DB: match against Customer table
    DB-->>Verify: match: customer_id=123
    Verify->>Verify: issue_code -> pending_customer_id=123, state=CodeSent
    Verify-->>BE: code "sent" (console/log)
    BE->>FE: show_code_modal = true

    User->>FE: enters code
    FE->>BE: POST /verify-code {code, session_id}
    BE->>Verify: verify_code(code)
    Verify-->>BE: ok -> state=Verified, customer_id=123
    BE-->>FE: 200 OK, verified

    User->>FE: "What's the status of my shipment?"
    FE->>BE: POST /chat {message, session_id}
    Note over BE: state = Verified
    BE->>LLM: prompt + lookup_shipments tool
    LLM-->>BE: tool_call: lookup_shipments()
    BE->>Tools: run_tool("lookup_shipments", args, session)
    Note over Tools: Enforcement point: ignores model args,<br/>ALWAYS scopes to session.customer_id, re-checks verified
    Tools->>DB: SELECT * FROM shipments WHERE customer_id=123
    DB-->>Tools: shipment rows
    Tools-->>BE: shipment data
    BE->>LLM: tool result
    LLM-->>BE: natural-language answer
    BE->>FE: assistant message
```

## 4. Data model (6.4 ERD)

```mermaid
erDiagram
    CUSTOMER ||--o{ SHIPMENT : has
    SHIPMENT ||--o{ PACKAGE : contains
    CUSTOMER ||--o{ CHAT_SESSION : "may be linked to (post-verification)"
    CUSTOMER {
        uuid id PK
        string first_name
        string last_name
        string phone_number
        string address
        datetime updated_at
    }
    SHIPMENT {
        uuid id PK
        uuid customer_id FK
        string tracking_number
        string status
        string carrier
        string origin
        string destination
        date estimated_delivery
        datetime last_update
        datetime updated_at
    }
    PACKAGE {
        uuid id PK
        uuid shipment_id FK
        string description
        decimal weight_kg
        decimal declared_value
        datetime updated_at
    }
    CHAT_SESSION {
        uuid id PK
        uuid customer_id FK "nullable until Verified"
        uuid pending_customer_id FK "set once identity matches"
        string state
        string code "6-digit, cleared after use"
        datetime code_expires_at
        int code_attempts
        datetime started_at
        datetime ended_at
        jsonb transcript
    }
```

## 5. Deployment / local dev topology (6.5 - our baseline)

```mermaid
flowchart LR
    subgraph DevMachine["Engineer's MacBook"]
        direction TB
        subgraph Compose["podman compose up (all three containerized)"]
            direction TB
            ReactC["frontend container :5173"]
            PyC["backend container :8000"]
            PgC[("postgres container :5432")]
        end
        Browser[Browser]
        OllamaHost["Ollama on HOST (Metal) :11434"]
    end

    subgraph Cloud["External Services"]
        AuthProvider["Auth0 (admin auth only)"]
    end

    Browser --> ReactC
    ReactC -->|"REST/JSON (HTTP)"| PyC
    PyC -->|"host.containers.internal:11434"| OllamaHost
    PyC --> PgC
    PyC -.->|"admin token validation"| AuthProvider

    style Compose fill:#e6f2ff,stroke:#3380cc,stroke-width:2px
    style OllamaHost fill:#fff4e6,stroke:#cc8800,stroke-width:2px
```
