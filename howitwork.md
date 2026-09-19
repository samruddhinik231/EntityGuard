# How the UEBA Security Operations Platform Works 🚀

The platform is designed to act as an enterprise Security Operations Center (SOC), providing real-time User and Entity Behavior Analytics (UEBA).

## 🏗️ Architecture Layers

The architecture consists of three main systems:

### 1. Ingestion Engine (The Connector)
* **Endpoint:** `POST /api/v1/logs/ingest`
* **Role:** External services (Firewalls, VPNs, Active Directory, Identity Providers) use a specific machine-account called **Connector** to pipe logs into the platform securely using a Bearer token.
* **Process:** Logs describe actions (e.g., `login_failed`, `large_data_transfer`) and actors. 

### 2. Processing Brain (Node.js & Express)
* **Risk Scoring:** When logs hit the ingestion endpoint, the Node layer mathematically analyzes them for anomalies (e.g., trying to log in from a new country, or generating 5 failed passwords). 
* **Alert Generation:** If anomalous, the node creates a **Critical, High, Medium, or Low** Alert associated with the user, instantly updating the global SOC score and the target individual's risk score.
* **Security & Auditing:** The platform is hardened with Pluggable Drivers (Environment arrays or PostgreSQL) for authentication, anti-brute force rate-forcing/locking, and a standardized JSON-lines Audit logger tracking who accessed what.

### 3. Live Dashboard (React & WebSockets)
* **Data Push:** We utilize Socket.IO to maintain an open WebSocket connection instead of demanding users refresh the page.
* **Real-time SOC:** The split-second an ingested log creates an alert in the backend, the Node engine triggers an event to the UI pushing the new alert and the changed Risk Score dynamically out to any connected browsers.

---

## 🔐 Role-Based Access Control (RBAC) Matrix

Users receive different data subsets dynamically based on their secure `HttpOnly` token role:

| Capability | **Admin** (SOC Manager) | **Analyst** (Standard User) | **Connector** (Machine Log Ingest) |
| :--- | :--- | :--- | :--- |
| **API Log Ingestion** | Allowed | Allowed | **Primary Role** |
| **Alert/User Dashboard Data** | View All Info | View All Info | Denied (`403 Forbidden`) |
| **Cases Dashboard View** | **View ALL global cases** | **View ONLY assigned to them** | Denied |
| **Real-time WebSockets** | Yes | Yes | No |
| **System Security Audit** | Writes to backend files | Influence | Hidden |

## 🧪 How to Simulate Data Locally

Because the platform is capable of digesting millions of real logs, you can test its load capabilities:

1. Look in the root folder for `load-test.js`.
2. Ensure your backend server is running (`npm start` inside `/server`).
3. Run `node load-test.js`.
4. This script logs in as the Connector role and blasts 10,000 real-world normalized JSON logs into your endpoint securely, randomly triggering Brute Force traps and Data Exfiltration traps. 
5. Any browser tabs you have logged into the Dashboard on **port 5177** will instantaneously update their risk charts live!