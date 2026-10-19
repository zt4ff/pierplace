from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import auth, laptops, location, me, misc, piscine, seats, social, tables, work
from .ws.chat import router as chat_router
from .ws.presence import router as presence_router
from .routers.announcements import router as announcements_router
from .core.scheduler import EventScheduler

app = FastAPI(title="PierPlace API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(me.router)
app.include_router(seats.router)
app.include_router(location.router)
app.include_router(laptops.router)
app.include_router(piscine.router)
app.include_router(work.router)
app.include_router(social.router)
app.include_router(misc.router)
app.include_router(tables.router)
app.include_router(announcements_router)

# WebSockets live on the same app/port as the REST API.
app.include_router(presence_router)
app.include_router(chat_router)

scheduler = EventScheduler()


@app.on_event("startup")
async def startup_event():
    """Start background scheduler on startup."""
    await scheduler.start_scheduler()


@app.get("/health")
async def health():
    return {"ok": True}
