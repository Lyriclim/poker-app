# Share the App with friends (ngrok)

One-time setup:

1. Create your own [free ngrok account](https://dashboard.ngrok.com/signup).
2. Open [Your Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken).
3. Double-click **Configure ngrok.cmd** and paste your token. Input is hidden. It is saved by ngrok in your Windows user configuration, not in this project. Never send the token in chat.

For each session:

1. Double-click **Start Public Access.cmd**. It rebuilds changed web files, checks the running server version and updates it only when no hand or player connection is active. If it says **Update pending**, finish the game, close player tabs and launch it again. For a server from before this update, double-click **Update App.cmd** after the game; it asks you to type `UPDATE` before replacing that older version.
2. Wait for the verified `https://...ngrok-free.dev` / `ngrok.app` link. Send it to friends.
3. A first-time ngrok browser notice may require clicking **Visit Site**.
4. Keep this computer awake and online. Closing the launch window leaves sharing active.
5. **Stop Public Access.cmd** stops sharing only. The local App stays running at `http://localhost:3001`.

The current verified URL is saved in `.runtime/public-url.txt`. The launcher never publishes an unverified URL. Opening the launcher again checks the same running tunnel, including one that is still connecting after its first minute. A failed health check leaves that tunnel running so ngrok can reconnect without dropping an existing session. Wait and open the launcher again to check its status; stop and restart sharing explicitly only if necessary.

Free accounts have usage limits, including bandwidth and request quotas. See [ngrok free plan limits](https://ngrok.com/docs/pricing-limits/free-plan-limits). This setup does not guarantee a Hong Kong route or uninterrupted connectivity. Validate it with friends on their actual networks.

If all seated participants in a hand disconnect, the current cards, bets and stacks are held in server memory. AFK actions, showdown settlement and the blind clock stop. After at least two participants return, the host presses **Resume with two players online**. The AFK check starts with a fresh window; showdown resumes with its remaining time. Other players and spectators cannot resume for the host. Between hands, an all-seated-players disconnect also pauses the session clock.

Hands begun on the updated server have a private recovery checkpoint in `.runtime/room-state/` on this computer. The server writes the deck, private cards, bets and turn before publishing each new hand state. After an unexpected server restart, the hand is held until at least two players reconnect and the host resumes it. A hand already running before this update has no checkpoint and still resumes from the previous saved result. Restarting only the public tunnel leaves the local server and hand intact.

An unvisited room is archived after 24 hours, checked at startup and hourly. Its last activity is kept on disk so restarting the server does not reset this clock. An active hand or connected player prevents archival. Archival closes the room and records remaining saved chips; it does not delete settled hand history.

Open room details to see round-trip latency and WebSocket/Polling transport. The App automatically reconnects and rejoins the table for a fresh state; if the socket reconnects but the table state is delayed, it retries joining the same room. The connection banner stays visible until a fresh table state arrives. Bets are not automatically replayed. If a command times out, check the updated table before trying again.

The 5-second showdown display is intentional. To diagnose extra settlement delay, compare `hand.showdown` and `hand.settled` events in `.runtime/server-out.log`; `saveMs` is the database write time after the showdown ends. These local timings cannot measure a friend's route through ngrok.

Connection timestamps, transport changes and disconnect reasons are in `.runtime/server-out.log`. Tunnel logs are identified by `.runtime/tunnel-log-path.txt`; startup errors also have a `.error` log. Diagnostic latency probes run every 15 seconds only while connected. They measure the whole route, not server processing alone.
