from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ProblemError(Exception):
    def __init__(self, status: int, title: str, detail: str | None = None, type_: str = "about:blank"):
        self.status, self.title, self.detail, self.type = status, title, detail, type_


def response(status: int, title: str, detail: str | None = None, type_: str = "about:blank") -> JSONResponse:
    body = {"type": type_, "title": title, "status": status}
    if detail:
        body["detail"] = detail
    return JSONResponse(body, status_code=status, media_type="application/problem+json")


async def problem_handler(_: Request, exc: ProblemError) -> JSONResponse:
    return response(exc.status, exc.title, exc.detail, exc.type)


async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [{"field": ".".join(str(p) for p in e["loc"] if p != "query"), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(
        {"type": "about:blank", "title": "Validation Error", "status": 422,
         "detail": "Request validation failed.", "errors": errors},
        status_code=422, media_type="application/problem+json",
    )
