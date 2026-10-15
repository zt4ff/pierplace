from fastapi import FastAPI

from .routers import auth, laptops, location, me, misc, piscine, seats, social, work

app = FastAPI(title="PierPlace Piscine API")
app.include_router(auth.router)
app.include_router(me.router)
app.include_router(seats.router)
app.include_router(location.router)
app.include_router(laptops.router)
app.include_router(piscine.router)
app.include_router(work.router)
app.include_router(social.router)
app.include_router(misc.router)


@app.get("/health")
async def health():
    return {"ok": True}
