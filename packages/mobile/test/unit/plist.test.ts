import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { patchInfoPlist, readPlistLocalNetworking, readPlistSchemes } from '../../src/runtime/cli/plist'

const template = readFileSync(new URL('./fixtures/Info.plist', import.meta.url), 'utf8')

describe('Info.plist patching', () => {
  it('adds CFBundleURLTypes, local networking and its usage description to the Capacitor template', () => {
    const { contents, changed, added } = patchInfoPlist(template, { schemes: ['nu.frigear.app'], allowLocalNetworking: true })
    expect(changed).toBe(true)
    expect(added).toEqual(['CFBundleURLSchemes: nu.frigear.app', 'NSAppTransportSecurity: NSAllowsLocalNetworking', 'NSLocalNetworkUsageDescription'])
    expect(readPlistSchemes(contents)).toEqual(['nu.frigear.app'])
    expect(readPlistLocalNetworking(contents)).toBe(true)
    expect(contents).toContain('\t<key>CFBundleURLTypes</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>CFBundleURLName</key>')
    expect(contents.trimEnd().endsWith('</dict>\n</plist>')).toBe(true)
  })

  it('is idempotent', () => {
    const once = patchInfoPlist(template, { schemes: ['nu.frigear.app'], allowLocalNetworking: true }).contents
    const twice = patchInfoPlist(once, { schemes: ['NU.FRIGEAR.APP'], allowLocalNetworking: true })
    expect(twice.changed).toBe(false)
    expect(twice.contents).toBe(once)
  })

  it('adds a missing scheme next to existing URL types, resolving $(PRODUCT_BUNDLE_IDENTIFIER)', () => {
    const existing = template.replace('<key>CFBundleVersion</key>', `<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
\t\t\t</array>
\t\t</dict>
\t</array>
\t<key>CFBundleVersion</key>`)
    const variables = { PRODUCT_BUNDLE_IDENTIFIER: 'nu.frigear.App' }
    expect(patchInfoPlist(existing, { schemes: ['nu.frigear.app'], variables }).changed).toBe(false)
    const patched = patchInfoPlist(existing, { schemes: ['nu.frigear.app', 'frigear'], variables })
    expect(patched.added).toEqual(['CFBundleURLSchemes: frigear'])
    expect(readPlistSchemes(patched.contents, variables)).toEqual(['nu.frigear.App', 'frigear'])
  })

  it('adds local networking to an existing NSAppTransportSecurity dict and keeps comments', () => {
    const existing = template.replace('<key>CFBundleVersion</key>', `<!-- ATS <key>fake</key> -->
\t<key>NSAppTransportSecurity</key>
\t<dict>
\t\t<key>NSAllowsArbitraryLoadsInWebContent</key>
\t\t<true/>
\t</dict>
\t<key>CFBundleVersion</key>`)
    const { contents } = patchInfoPlist(existing, { schemes: [], allowLocalNetworking: true })
    expect(readPlistLocalNetworking(contents)).toBe(true)
    expect(contents).toContain('<!-- ATS <key>fake</key> -->')
    expect(contents.match(/NSAppTransportSecurity/g)).toHaveLength(1)
  })

  it('rejects a file that is not a property list', () => {
    expect(() => patchInfoPlist('<html></html>', { schemes: ['x'] })).toThrow(/property list/)
  })
})
