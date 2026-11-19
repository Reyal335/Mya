import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withoutDeadCaFiles } from './caEnv.ts'

const present = new Set(['C:\\certs\\good.pem'])
const exists = (path: string): boolean => present.has(path)

test('ca env: a bundle variable that names a missing file is left out', () => {
  const { env, dropped } = withoutDeadCaFiles(
    { SSL_CERT_FILE: 'D:\\Anaconda\\ssl\\cacert.pem', PATH: 'x' },
    exists
  )
  assert.equal(env.SSL_CERT_FILE, undefined)
  assert.equal('SSL_CERT_FILE' in env, false)
  assert.deepEqual(dropped, ['SSL_CERT_FILE'])
  assert.equal(env.PATH, 'x')
})

test('ca env: one that names a file that is there is kept', () => {
  const { env, dropped } = withoutDeadCaFiles({ SSL_CERT_FILE: 'C:\\certs\\good.pem' }, exists)
  assert.equal(env.SSL_CERT_FILE, 'C:\\certs\\good.pem')
  assert.deepEqual(dropped, [])
})

test('ca env: both variables are checked, each on its own', () => {
  const { env, dropped } = withoutDeadCaFiles(
    { SSL_CERT_FILE: 'C:\\certs\\good.pem', CODEX_CA_CERTIFICATE: 'C:\\gone.pem' },
    exists
  )
  assert.equal(env.SSL_CERT_FILE, 'C:\\certs\\good.pem')
  assert.equal('CODEX_CA_CERTIFICATE' in env, false)
  assert.deepEqual(dropped, ['CODEX_CA_CERTIFICATE'])
})

test('ca env: unset and empty variables are left alone', () => {
  const { env, dropped } = withoutDeadCaFiles({ SSL_CERT_FILE: '  ' }, () => false)
  assert.equal(env.SSL_CERT_FILE, '  ')
  assert.deepEqual(dropped, [])
  assert.deepEqual(withoutDeadCaFiles({}, () => false).env, {})
})

test('ca env: the environment it was given is not changed', () => {
  const source = { SSL_CERT_FILE: 'C:\\gone.pem' }
  withoutDeadCaFiles(source, () => false)
  assert.equal(source.SSL_CERT_FILE, 'C:\\gone.pem')
})
