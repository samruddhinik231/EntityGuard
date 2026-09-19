# UEBA Security Operations Platform ???

A production-ready User and Entity Behavior Analytics (UEBA) dashboard built around an intelligent ingestion pipeline. This platform empowers Security Operation Centers (SOC) to ingest logs from ActiveDirectory, VPNs, and Firewalls, compute real-time risk scores for employees, and instantly trigger Live alerts via WebSockets.

## ?? Quick Start Guide

### 1. Setup Backend
1. Open a terminal and navigate to (/server).
2. Run 
pm install.
3. Start the backend: 
pm start
*(Server listens on 5000)*

### 2. Setup Frontend
1. Open a new terminal and navigate to (/frontend).
2. Run 
pm install.
3. Start Vite: 
pm run dev
*(Dashboard launches to http://localhost:5177)*

### 3. Generate Analytics Test Activity 
1. In another terminal in the root, run the 10,000 log Simulator to start piping real-world behaviors into your SOC:

ode load-test.js
2. Log into the local interface (localhost:5177) utilizing the dual-lens view:
   *  **Admin user:** dmin / dmin123 (sees all alerts and all open global cases)
   *  **Analyst user:** nalyst / nalyst123 (limited to specific assigned cases)

---
*See [howitwork.md](./howitwork.md) for deeper layout architecture details.*
