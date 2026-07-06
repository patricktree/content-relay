import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { serializeErrorWithCause } from "@patricktree/commons-ecma/util/error";
import { jsonUtil } from "@patricktree/commons-ecma/util/json";

import type { Attributes } from "@opentelemetry/api";

export type LogAttributes = Attributes;

export type LogErrorContext = {
  error: unknown;
};

export type LoggerMethod = {
  (message: string, attributes?: LogAttributes): void;
  (errorContext: LogErrorContext, message: string, attributes?: LogAttributes): void;
};

export type Logger = {
  debug: LoggerMethod;
  info: LoggerMethod;
  warn: LoggerMethod;
  error: LoggerMethod;
};

export function createLogger(name: string): Logger {
  const logger = logs.getLogger(name);

  function emitLog(
    severityNumber: SeverityNumber,
    firstArgument: string | LogErrorContext,
    secondArgument?: string | LogAttributes,
    thirdArgument?: LogAttributes,
  ): void {
    const { attributes, message } = resolveLogArguments(
      firstArgument,
      secondArgument,
      thirdArgument,
    );

    logger.emit({
      severityNumber,
      body: message,
      attributes,
    });
  }

  return {
    debug(
      firstArgument: string | LogErrorContext,
      secondArgument?: string | LogAttributes,
      thirdArgument?: LogAttributes,
    ) {
      emitLog(SeverityNumber.DEBUG, firstArgument, secondArgument, thirdArgument);
    },
    info(
      firstArgument: string | LogErrorContext,
      secondArgument?: string | LogAttributes,
      thirdArgument?: LogAttributes,
    ) {
      emitLog(SeverityNumber.INFO, firstArgument, secondArgument, thirdArgument);
    },
    warn(
      firstArgument: string | LogErrorContext,
      secondArgument?: string | LogAttributes,
      thirdArgument?: LogAttributes,
    ) {
      emitLog(SeverityNumber.WARN, firstArgument, secondArgument, thirdArgument);
    },
    error(
      firstArgument: string | LogErrorContext,
      secondArgument?: string | LogAttributes,
      thirdArgument?: LogAttributes,
    ) {
      emitLog(SeverityNumber.ERROR, firstArgument, secondArgument, thirdArgument);
    },
  };
}

function resolveLogArguments(
  firstArgument: string | LogErrorContext,
  secondArgument?: string | LogAttributes,
  thirdArgument?: LogAttributes,
): {
  message: string;
  attributes: LogAttributes;
} {
  if (typeof firstArgument === "string") {
    if (typeof secondArgument === "string") {
      throw new TypeError(
        "Logger attributes must be an object when the first argument is a message.",
      );
    }

    return {
      message: firstArgument,
      attributes: secondArgument ?? {},
    };
  }

  if (typeof secondArgument !== "string") {
    throw new TypeError(
      "Logger message must be a string when the first argument is an error context.",
    );
  }

  return {
    message: secondArgument,
    attributes: {
      ...serializeErrorAttributes(firstArgument.error),
      ...thirdArgument,
    },
  };
}

function serializeErrorAttributes(error: unknown) {
  let errorToUse;
  if (error instanceof Error) {
    errorToUse = serializeErrorWithCause(error);
  } else {
    errorToUse = error;
  }

  return {
    error: jsonUtil.safeStringify(errorToUse),
  } satisfies LogAttributes;
}
