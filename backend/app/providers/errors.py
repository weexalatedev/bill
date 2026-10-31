class ProviderError(Exception):
    """Base for every upstream-provider failure; main.py maps it to an HTTP response."""
    status = 502

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class ProviderAuthError(ProviderError):
    status = 401


class ProviderRateLimited(ProviderError):
    status = 429
