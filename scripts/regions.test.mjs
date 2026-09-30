import { describe, expect, it } from 'vitest'

import { regions } from './regions.mjs'

/** A file from its lines, so a test can say which line a marker is on. */
const file = (...lines) => lines.join('\n')

describe('regions', () => {
  it('comes back without its markers and without the indent its lines share', () => {
    const found = regions(
      file(
        'mount() {',
        '  // #region What the page reports',
        '  button.addEventListener("click", () => {',
        '',
        '    leko.reached("saved")',
        '  })',
        '  // #endregion',
        '}',
      ),
    )
    expect(found).toEqual([
      {
        title: 'What the page reports',
        code: 'button.addEventListener("click", () => {\n\n  leko.reached("saved")\n})',
      },
    ])
  })

  it('comes back in file order, each with the title its marker names', () => {
    const found = regions(
      file(
        '// #region The story',
        'const story = {}',
        '// #endregion',
        'const between = 1',
        '// #region What the page reports',
        'leko.reached("saved")',
        '// #endregion',
      ),
    )
    expect(found.map((one) => one.title)).toEqual(['The story', 'What the page reports'])
    expect(found.map((one) => one.code)).toEqual(['const story = {}', 'leko.reached("saved")'])
  })

  it('refuses a file with no region', () => {
    expect(() => regions(file('const story = {}'))).toThrow('no region')
  })

  it('refuses a region that is never closed', () => {
    expect(() => regions(file('const a = 1', '// #region The story', 'const story = {}'))).toThrow(
      'line 2: the region “The story” is never closed',
    )
  })

  it('refuses a region opened inside another', () => {
    expect(() =>
      regions(file('// #region The story', '// #region Inner', '// #endregion', '// #endregion')),
    ).toThrow('line 2: a region opens inside “The story”')
  })

  it('refuses an #endregion with no region open', () => {
    expect(() => regions(file('// #region The story', '// #endregion', '// #endregion'))).toThrow(
      'line 3: an #endregion closes no region',
    )
  })
})
