export function errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message
    return String(err)
}

/** Status code from an Octokit RequestError or a generic error; undefined otherwise. */
export function errorStatus(err: unknown): number | undefined {
    if (err && typeof err === 'object' && 'status' in err) {
        const s = (err as {status: unknown}).status
        if (typeof s === 'number') return s
    }
    return undefined
}
