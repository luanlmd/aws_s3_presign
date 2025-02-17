import { Sha256, HmacSha256 } from 'https://deno.land/std@0.160.0/hash/sha256.ts'

const NEWLINE = '\n'

export interface GetSignedUrlOptions {
  bucket: string
  key: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  method?: 'GET' | 'PUT'
  region?: string
  queryParams?: Record<string, string | number>
  expiresIn?: number
  date?: Date,
  endpoint?: string,
  usePathRequestStyle?: boolean,
  signatureKey?: string,
}

function sha256(data: string): string {
  return new Sha256().update(data).hex()
}

function hmacSha256(key: string | ArrayBuffer, data: string): ArrayBuffer {
  return new HmacSha256(key).update(data).arrayBuffer()
}

function hmacSha256Hex(key: string | ArrayBuffer, data: string): string {
  return new HmacSha256(key).update(data).hex()
}

function ymd(date: Date): string {
  return date.toISOString().substring(0, 10).replace(/[^\d]/g, '')
}

function isoDate(date: Date): string {
  return `${date.toISOString().substring(0, 19).replace(/[^\dT]/g, '')}Z`
}

function getHost(options: GetSignedUrlOptions) {
  return options.usePathRequestStyle ? options.endpoint : `${options.bucket}.${options.endpoint}`
}

function getPath(options: GetSignedUrlOptions) {
  const path = options.usePathRequestStyle ? `/${options.bucket}/${options.key}` : `/${options.key}`

  return path.replaceAll(/\/+/g, '/')
}

function parseOptions(provided: GetSignedUrlOptions): Required<GetSignedUrlOptions> {
  return {
    ...{
      method: 'GET',
      region: 'us-east-1',
      expiresIn: 86400,
      date: new Date(),
      sessionToken: '',
      endpoint: 's3.amazonaws.com',
      queryParams: {},
      usePathRequestStyle: false,
      signatureKey: '',
    },
    ...provided,
  }
}

function getQueryParameters(options: Required<GetSignedUrlOptions>): URLSearchParams {
  return new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${options.accessKeyId}/${ymd(options.date)}/${options.region}/s3/aws4_request`,
    'X-Amz-Date': isoDate(options.date),
    'X-Amz-Expires': options.expiresIn.toString(),
    'X-Amz-SignedHeaders': 'host',
    ...(options.sessionToken ? { 'X-Amz-Security-Token': options.sessionToken } : {}),
    ...options.queryParams,
  })
}

function getCanonicalRequest(options: Required<GetSignedUrlOptions>, queryParameters: URLSearchParams): string {
  queryParameters.sort()

  return [
    options.method, NEWLINE,
    getPath(options), NEWLINE,
    queryParameters.toString(), NEWLINE,
    `host:${getHost(options)}`, NEWLINE,
    NEWLINE,
    'host', NEWLINE,
    'UNSIGNED-PAYLOAD',
  ].join('')
}

function getSignaturePayload(options: Required<GetSignedUrlOptions>, payload: string): string {
  return [
    'AWS4-HMAC-SHA256', NEWLINE,
    isoDate(options.date), NEWLINE,
    `${ymd(options.date)}/${options.region}/s3/aws4_request`, NEWLINE,
    sha256(payload),
  ].join('')
}

function getSignatureKey(options: Required<GetSignedUrlOptions>): string {
  type reducer = (previous: string, current: string) => any

  return [
    `AWS4${options.secretAccessKey}`,
    ymd(options.date),
    options.region,
    's3',
    'aws4_request',
  ].reduce(hmacSha256 as reducer)
}

function getUrl(options: Required<GetSignedUrlOptions>, queryParameters: URLSearchParams, signature: string): string {
  queryParameters.set('X-Amz-Signature', signature)

  return `https://${getHost(options)}${getPath(options)}?${new URLSearchParams(queryParameters).toString()}`
}

export function getPreSignatureKey(options: GetSignedUrlOptions): any {
  const parsedOptions = parseOptions(options);
  return getSignatureKey(parsedOptions);
}

export function getSignedUrl(options: GetSignedUrlOptions): string {
  const parsedOptions = parseOptions(options)
  const queryParameters = getQueryParameters(parsedOptions)
  const canonicalRequest = getCanonicalRequest(parsedOptions, queryParameters)
  const signaturePayload = getSignaturePayload(parsedOptions, canonicalRequest)
  const signatureKey = parsedOptions.signatureKey || getSignatureKey(parsedOptions)
  const signature = hmacSha256Hex(signatureKey, signaturePayload)
  const url = getUrl(parsedOptions, queryParameters, signature)

  return url
}
