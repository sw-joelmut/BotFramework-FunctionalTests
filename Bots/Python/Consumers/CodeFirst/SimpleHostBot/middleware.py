from aiohttp.web import (
    middleware,
    Request
)
from botbuilder.schema import Activity
from logging import Logger

class CustomMiddleware:
    def __init__(
            self,
            logger: Logger
        ):
            self._logger = logger
            self._properties = {'custom_dimensions': {'Environment': 'Python', 'Bot': 'SimpleHostBot'}}

    @middleware
    async def custom_middleware(self, request: Request, handler):
        body = await request.json()
        activity = Activity().deserialize(body)
        # await parse_request(activity)
        print(f'Request Middleware: \n{activity}')
        self._logger.log(1, f'Request Middleware: \n{activity}', extra=self._properties)
        # self._logger.exception(f'{activity}', extra=self._properties)

        response = await handler(request)
        return response

    @staticmethod
    async def parse_request(req):
            """
            Parses and validates request
            :param req:
            :return:
            """

            async def validate_activity(activity: Activity):
                if not isinstance(activity.type, str):
                    raise TypeError(
                        "BotFrameworkAdapter.parse_request(): invalid or missing activity type."
                    )
                return True

            if not isinstance(req, Activity):
                # If the req is a raw HTTP Request, try to deserialize it into an Activity and return the Activity.
                if getattr(req, "body_exists", False):
                    try:
                        body = await req.json()
                        activity = Activity().deserialize(body)
                        is_valid_activity = await validate_activity(activity)
                        if is_valid_activity:
                            return activity
                    except Exception as error:
                        raise error
                elif "body" in req:
                    try:
                        activity = Activity().deserialize(req["body"])
                        is_valid_activity = await validate_activity(activity)
                        if is_valid_activity:
                            return activity
                    except Exception as error:
                        raise error
                else:
                    raise TypeError(
                        "BotFrameworkAdapter.parse_request(): received invalid request"
                    )
            else:
                # The `req` has already been deserialized to an Activity, so verify the Activity.type and return it.
                is_valid_activity = await validate_activity(req)
                if is_valid_activity:
                    return req
