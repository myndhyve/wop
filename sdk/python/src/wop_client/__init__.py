"""
wop-client — Python reference SDK for WOP-compliant servers.

Public surface:
    WopClient          — sync HTTP client
    WopError           — typed exception (carries traceparent + traceId)
    RunStatus, StreamMode  — string-typed enums
    All request/response dataclasses

See README.md for usage.
"""

from .client import WopClient
from .errors import WopError
from .sse import stream_events
from .types import (
    Capabilities,
    CancelRunRequest,
    CancelRunResponse,
    CreateRunRequest,
    CreateRunResponse,
    ErrorEnvelope,
    ForkRunRequest,
    ForkRunResponse,
    InterruptByTokenInspection,
    PollEventsResponse,
    ResolveInterruptRequest,
    ResolveInterruptResponse,
    RunConfigurable,
    RunEventDoc,
    RunSnapshot,
    RunStatus,
    StreamMode,
)

__version__ = "1.0.0"

__all__ = [
    "WopClient",
    "WopError",
    "stream_events",
    # Types
    "Capabilities",
    "CancelRunRequest",
    "CancelRunResponse",
    "CreateRunRequest",
    "CreateRunResponse",
    "ErrorEnvelope",
    "ForkRunRequest",
    "ForkRunResponse",
    "InterruptByTokenInspection",
    "PollEventsResponse",
    "ResolveInterruptRequest",
    "ResolveInterruptResponse",
    "RunConfigurable",
    "RunEventDoc",
    "RunSnapshot",
    "RunStatus",
    "StreamMode",
    "__version__",
]
