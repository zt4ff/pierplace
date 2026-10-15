# pip install websockets
import asyncio, json, uuid
import websockets

players = {}  # ws -> player state

async def broadcast(msg, skip=None):
    data = json.dumps(msg)
    for ws in list(players):
        if ws is not skip:
            try:
                await ws.send(data)
            except websockets.ConnectionClosed:
                pass

async def handler(ws):
    pid = str(uuid.uuid4())
    try:
        hello = json.loads(await ws.recv())          # {"type":"join","profile":{...},"floor":1}
        if hello.get("type") != "join":
            return
        me = {"id": pid, "profile": hello.get("profile", {}), "floor": hello.get("floor", 1),
              "x": 0, "y": 0, "seated": False, "tableId": None}
        await ws.send(json.dumps({"type": "welcome", "id": pid, "players": list(players.values())}))
        players[ws] = me
        await broadcast({"type": "joined", "player": me}, skip=ws)
        print(f"+ {me['profile'].get('name', pid)} joined ({len(players)} online)")

        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("type") == "move":            # {"type":"move","x":..,"y":..,"seated":..,"tableId":..,"floor":..}
                for k in ("x", "y", "seated", "tableId", "floor"):
                    if k in msg:
                        me[k] = msg[k]
                await broadcast({"type": "moved", "id": pid, **{k: me[k] for k in ("x", "y", "seated", "tableId", "floor")}}, skip=ws)
    except (websockets.ConnectionClosed, json.JSONDecodeError):
        pass
    finally:
        left = players.pop(ws, None)
        if left:
            await broadcast({"type": "left", "id": pid})
            print(f"- {left['profile'].get('name', pid)} left ({len(players)} online)")

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):
        print("Presence server on ws://localhost:8765")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
