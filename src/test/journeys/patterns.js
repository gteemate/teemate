// A database message as a pattern: % (a value filled in by the database) stands for any words.
export const messagePattern = msg => new RegExp(`^${msg.split('%').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`)
