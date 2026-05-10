/**
 * Phải import file này trước mọi thứ khác trong main.tsx.
 * circomlibjs → assert → util cần `process`; blake-hash cần `Buffer`.
 */
import process from 'process'
import { Buffer } from 'buffer'

Object.assign(globalThis, { process, Buffer })
