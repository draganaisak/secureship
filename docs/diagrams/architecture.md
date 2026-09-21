# SecureShip Architecture Diagrams

Starting-reference diagrams from the spec (Section 6), covering the build path we chose:
**HTTP transport + Podman with Ollama on the host**. These get regenerated against the real
implementation in Week 5. The WebSocket (6.3b) and fully-containerized-Ollama (6.5 bonus)
variants are intentionally omitted here - they live in `docs/project-requirements.md` if needed.

## 1. High-level system architecture (6.1)

```mermaid
flowchart TB
    subgraph Client["Browser / Frontend (React)"]
        UI[Chat Window UI]
        Modal["6-digit Code Modal<br/>(rendered on demand)"]
        AdminUI[Admin Panel UI]
    end

    subgraph Backend["Backend API (Python / FastAPI)"]
        ChatAPI["/chat endpoint (HTTP)"]
        VerifyAPI["/verify-code endpoint"]
        AdminAPI["/admin/* endpoints"]
        SessionStore["Session Store (live state)"]
        ChatDB["Chat Session Storage<br/>(Postgres JSONB)"]
        ToolLayer["Tool Layer<br/>(enforces gating BEFORE any data tool executes)"]
        AuthMW["Admin Auth Middleware (Auth0 SDK)"]
    end

    subgraph LocalLLM["Local LLM Runtime (host)"]
        Ollama["Ollama Server (host.containers.internal:11434)"]
        Model["qwen3:8b"]
    end

    subgraph DataLayer["Data Layer"]
        DB[("Postgres<br/>Customers / Shipments / Packages / ChatSessions")]
        SMSMock["Mock SMS Service (console/log)"]
    end

    subgraph IdP["Identity Provider"]
        Auth0["Auth0 (admin login ONLY)"]
    end

    UI -->|"user message"| ChatAPI
    ChatAPI -->|"prompt + tool defs"| Ollama
    Ollama --> Model
    Model -->|"tool call request"| ChatAPI
    ChatAPI -->|"checks session.verified"| ToolLayer
    ToolLayer -->|"if verified"| DB
    ToolLayer -->|"send_code tool"| SMSMock
    ChatAPI <-->|"read/write live state"| SessionStore
    ChatAPI -->|"persist transcript on each turn"| ChatDB
    UI -->|"on verification step"| Modal
    Modal -->|"submit code"| VerifyAPI
    VerifyAPI --> SessionStore

    AdminUI -->|"login redirect"| Auth0
    Auth0 -->|"JWT"| AdminUI
    AdminUI -->|"requests + JWT"| AdminAPI
    AdminAPI --> AuthMW
    AuthMW -->|"validated"| DB

    style ToolLayer fill:#ffe6cc,stroke:#d79b00,stroke-width:2px
    style AuthMW fill:#ffe6cc,stroke:#d79b00,stroke-width:2px
```

## 2. Conversation / identity-gating state machine (6.2)

The contract the backend must enforce (implemented Week 2; Week 1 stays in Anonymous).

```mermaid
stateDiagram-v2
    [*] --> Anonymous

    Anonymous --> Anonymous: General chat / FAQ
    Anonymous --> CollectingIdentity: User asks about a shipment

    CollectingIdentity --> CollectingIdentity: Partial info given
    CollectingIdentity --> IdentityRejected: Info doesn't match any customer
    CollectingIdentity --> CodeSent: Full info matches a customer record

    IdentityRejected --> CollectingIdentity: User retries
    IdentityRejected --> Anonymous: User gives up / changes topic

    CodeSent --> AwaitingCode: Modal shown to user
    AwaitingCode --> Verified: Correct code entered
    AwaitingCode --> AwaitingCode: Incorrect code (attempt < max)
    AwaitingCode --> CodeExpired: Too many attempts OR timeout

    CodeExpired --> CollectingIdentity: User restarts verification

    Verified --> Verified: Shipment queries scoped to verified customer_id ONLY
    Verified --> [*]: Session ends / times out
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
        ColorShift --> HumanJoined: "Melany has entered the chat"
        HumanJoined --> ReadingUp
        ReadingUp --> Greeting: "Hey [first_name if known]..."
        Greeting --> [*]
    }

    ScriptedHandoff --> Anon: returns to Anonymous gating rules
    ScriptedHandoff --> Ver: returns to Verified gating rules
```

## 3. Tool-calling sequence - HTTP (6.3, the gating enforcement point)

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant BE as Backend (Chat API)
    participant Session as Session Store
    participant LLM as Local LLM (Ollama)
    participant Tools as Tool Layer
    participant DB as Database

    User->>FE: "Where's my package?"
    FE->>BE: POST /chat {message, session_id}
    BE->>Session: get session state
    Session-->>BE: state = "Anonymous"
    BE->>LLM: prompt + tool defs + state context
    LLM-->>BE: tool_call: request_identity_info()
    BE->>FE: assistant message asking for name/address/phone

    User->>FE: provides name, address, phone
    FE->>BE: POST /chat {message, session_id}
    BE->>LLM: prompt with collected fields
    LLM-->>BE: tool_call: verify_identity(fields)
    BE->>Tools: verify_identity(fields)
    Tools->>DB: match against Customer table
    DB-->>Tools: match found: customer_id=123
    Tools->>Session: set pending_customer_id=123, state="CodeSent"
    Tools-->>BE: result: code sent (mocked)
    BE->>FE: trigger modal display

    User->>FE: enters code
    FE->>BE: POST /verify-code {code, session_id}
    BE->>Tools: check_verification_code(code, session_id)
    Tools->>Session: compare code, check expiry/attempts
    Session-->>Tools: match, not expired
    Tools->>Session: set state="Verified", customer_id=123
    BE-->>FE: 200 OK, chat unlocked

    User->>FE: "What's the status of my shipment?"
    FE->>BE: POST /chat {message, session_id}
    BE->>Session: state="Verified", customer_id=123
    BE->>LLM: prompt + tool defs + verified context
    LLM-->>BE: tool_call: lookup_shipments(customer_id=123)
    BE->>Tools: lookup_shipments(customer_id=123)
    Note over Tools: Enforcement point: Tools layer ALWAYS uses<br/>session.customer_id, never a model/user-supplied id
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
    }
    PACKAGE {
        uuid id PK
        uuid shipment_id FK
        string description
        decimal weight_kg
        decimal declared_value
    }
    CHAT_SESSION {
        uuid id PK
        uuid customer_id FK "nullable until Verified"
        string state
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
