import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { patchAndroidManifest, readAndroidStrings, readManifestLinks } from '../../src/runtime/cli/manifest'

const template = readFileSync(new URL('./fixtures/AndroidManifest.xml', import.meta.url), 'utf8')
const strings = readAndroidStrings(readFileSync(new URL('./fixtures/strings.xml', import.meta.url), 'utf8'))

describe('AndroidManifest.xml patching', () => {
  it('reads strings.xml', () => {
    expect(strings.custom_url_scheme).toBe('com.getcapacitor.myapp')
  })

  it('adds VIEW intent filters for schemes and verified app links to the launcher activity', () => {
    const { contents, changed, added } = patchAndroidManifest(template, { schemes: ['nu.frigear.app'], hosts: ['App.Frigear.nu'] })
    expect(changed).toBe(true)
    expect(added).toEqual(['scheme nu.frigear.app', 'app link app.frigear.nu'])
    expect(readManifestLinks(contents)).toEqual({ schemes: ['nu.frigear.app'], hosts: ['app.frigear.nu'] })
    expect(contents).toContain('            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />')
    expect(contents).toContain('<intent-filter android:autoVerify="true">')
    // Inside the activity, before </activity>, the provider untouched.
    expect(contents.indexOf('nu.frigear.app')).toBeLessThan(contents.indexOf('</activity>'))
    expect(contents.indexOf('</activity>')).toBeLessThan(contents.indexOf('<provider'))
  })

  it('is idempotent', () => {
    const once = patchAndroidManifest(template, { schemes: ['nu.frigear.app'], hosts: ['app.frigear.nu'] }).contents
    expect(patchAndroidManifest(once, { schemes: ['nu.frigear.app'], hosts: ['app.frigear.nu'] })).toEqual({ contents: once, changed: false, added: [] })
  })

  it('counts a filter on @string/custom_url_scheme', () => {
    const withString = template.replace('        </activity>', `            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <data android:scheme="@string/custom_url_scheme" />
            </intent-filter>
        </activity>`)
    expect(readManifestLinks(withString, strings).schemes).toEqual(['com.getcapacitor.myapp'])
    expect(patchAndroidManifest(withString, { schemes: ['com.getcapacitor.myapp'], strings }).changed).toBe(false)
  })

  it('fails without a launcher activity', () => {
    expect(() => patchAndroidManifest('<manifest><application/></manifest>', { schemes: ['x'] })).toThrow(/launcher activity/)
  })
})
