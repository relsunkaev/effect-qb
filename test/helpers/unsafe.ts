export const unsafeNever = <T>(value: T): never => value as never

export const unsafeAny = <T>(value: T): any => value as any
