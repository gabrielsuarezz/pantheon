# Pantheon — Judge Demo Walkthrough (4 minutes)

Google ADK Challenge demo script. One presenter drives, one narrates if possible.

---

## Before the demo

- ADK Dev UI open in browser: https://pantheon-agents-63prhgdheq-uc.a.run.app/dev-ui/
- Live dashboard open in second tab: `$VULTR_SERVER_IP/dashboard`
- Sample ready: `6108674530.JS.malicious` (filename only — do NOT open the file)
- Terminal ready with the trigger curl command

---

## The opening line (15 seconds)

> "Pantheon is not a chatbot. It is a workforce of specialists — each one a Greek god, each one owning exactly one phase of incident response. When a malware sample arrives, the gods don't take turns. They work."

---

## Step 1 — Show the ADK Dev UI (30 seconds)

Open the Dev UI. Point at the agent tree in the left panel.

> "This is the Google ADK Dev UI running live on Cloud Run. You can see the full Pantheon agent hierarchy — Zeus at the top, then Athena, Hades, Apollo, and Ares. Every agent is a real ADK agent, not a function call dressed up as one."

Point at the two Cloud Run URLs in the browser address bar (or show both tabs).

> "And this second URL — that's a completely separate Cloud Run service. That's the remote impact specialist. We'll come back to it."

---

## Step 2 — Submit the sample and start the pipeline (30 seconds)

Run in terminal:

```bash
curl -X POST "https://pantheon-agents-63prhgdheq-uc.a.run.app/apps/pantheon_agent/users/demo/sessions" \
  -H "Content-Type: application/json" \
  -d '{"state": {}}'
# Copy the session_id from the response, then:
curl -X POST "https://pantheon-agents-63prhgdheq-uc.a.run.app/apps/pantheon_agent/users/demo/sessions/<session_id>/run" \
  -H "Content-Type: application/json" \
  -d '{"new_message": {"role": "user", "parts": [{"text": "Analyze sample: 6108674530.JS.malicious — AsyncRAT dropper, known IOCs already in agent context."}]}}'
```

> "Sample submitted. Watch the Dev UI."

---

## Step 3 — Point out the parallel Ares branches (60 seconds)

Wait for Ares to activate. In the Dev UI trace, three sub-agents will appear simultaneously.

> "Here — three Ares branches just fired at the same time. Containment, remediation, prevention. These are three independent ADK agents wrapped in a ParallelAgent. They don't wait for each other. Incident response planning is naturally parallel — we let ADK make that explicit."

Point at the event timestamps to show they overlap.

> "On the custom dashboard you can see the same thing — three TOOL_CALLED events arriving within milliseconds of each other."

---

## Step 4 — Point out the verifier loop (45 seconds)

After the parallel branches complete, the verifier activates.

> "Now watch this — the verifier agent reads all three plans and checks them against the evidence Hades and Apollo produced. If a plan references something that isn't supported by observed behavior, it flags it."

Wait for the reviser to fire (or point at the iteration counter in the trace).

> "The reviser corrects it. This is a LoopAgent — it runs up to two iterations. The ADK UI shows you the iteration count right here. This is what self-correction looks like at the framework level, not just a prompt that says 'check your work'."

---

## Step 5 — Point out the A2A handshake (45 seconds)

When Apollo hands off to impact_agent, the Dev UI will show a cross-service call.

> "Apollo just called out to a different Cloud Run service — the remote impact specialist. This is ADK's A2A protocol. Pantheon doesn't know how to reason about critical infrastructure continuity — that's not malware analysis. So it delegates to a specialist that does."

Point at the two URLs.

> "Two Cloud Run services. Two completely separate deployments. One real network call between them. When the specialist returns, Apollo takes that continuity assessment and passes it to Ares, which folds it into the final report."

---

## Step 6 — Show the final report (30 seconds)

When the pipeline completes, scroll the Dev UI response or pull it from the session:

```bash
curl "https://pantheon-agents-63prhgdheq-uc.a.run.app/apps/pantheon_agent/users/demo/sessions/<session_id>"
```

> "The final document has six sections — threat intelligence, critical infrastructure impact from the remote specialist, then containment, remediation, and prevention from the three parallel Ares planners. One document. One pipeline. Six agents."

---

## Closing line (15 seconds)

> "Everything you just saw is live on Google Cloud Run. The ADK UI, the agent traces, the A2A handshake — all of it. The URL is right there."

Point at the screen.

---

## Fallback if pipeline is slow

If the Cloud Run cold start delays the run:

> "Cloud Run spins down between runs — give it 10 seconds on first call. In production we set min-instances to 1 to eliminate cold start."

Then continue normally.

---

## Key phrases for judges

| Google scoring category | What to say |
| --- | --- |
| ADK runtime usage | "Running live on Cloud Run via `get_fast_api_app` with `web=True` and `a2a=True`" |
| ParallelAgent | "Three planners firing simultaneously — Pantheon doesn't serialize work that isn't sequential" |
| LoopAgent | "A verifier/reviser loop — ADK exits it when the plan passes evidence review" |
| A2A | "Two Cloud Run services, one real A2A handshake — the specialist lives at a different URL" |
