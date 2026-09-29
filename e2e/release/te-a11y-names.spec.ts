/**
 * T-E E-05（読み上げ）: 全場面のアクセシビリティツリー（Chromium の CDP）で、押せる要素・入力欄・画像に名前があること、
 * 見出しの構造（h1 が 1 つ）、main の存在、html の lang を確かめる。
 * 結果は test-results-te/ax/*.json。
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { appliesTo, SCENES } from './te-scenes.ts';

const OUT = 'test-results-te/ax';
mkdirSync(OUT, { recursive: true });

type AxNode = {
  nodeId: string;
  ignored?: boolean;
  role?: { value: string };
  name?: { value: string };
  backendDOMNodeId?: number;
  properties?: { name: string; value: { value: unknown } }[];
};

const NAMED_ROLES = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'slider', 'tab', 'menuitem', 'radio', 'checkbox', 'switch', 'spinbutton', 'img', 'gridcell', 'option', 'listbox', 'group', 'dialog', 'alertdialog', 'tablist', 'menu', 'navigation', 'table']);
// 名前が要らない（あれば良い）役割は除く。group・table は名前があるのが望ましいが、必須ではない
const REQUIRED = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'slider', 'tab', 'menuitem', 'radio', 'checkbox', 'switch', 'spinbutton', 'img', 'gridcell', 'dialog', 'alertdialog', 'option']);

async function axIssues(page: Page): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('Accessibility.enable');
  const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: AxNode[] };
  const issues: string[] = [];
  let h1 = 0;
  let main = 0;
  for (const n of nodes) {
    if (n.ignored) continue;
    const role = n.role?.value ?? '';
    const name = (n.name?.value ?? '').trim();
    if (role === 'heading') {
      const level = n.properties?.find((p) => p.name === 'level')?.value.value;
      if (level === 1) h1++;
    }
    if (role === 'main') main++;
    if (REQUIRED.has(role) && name === '') {
      let html = '';
      if (n.backendDOMNodeId) {
        try {
          const d = (await cdp.send('DOM.describeNode', { backendNodeId: n.backendDOMNodeId })) as { node: { nodeName: string; attributes?: string[] } };
          const attrs = d.node.attributes ?? [];
          const c = attrs[attrs.indexOf('class') + 1] ?? '';
          html = `${d.node.nodeName.toLowerCase()}${c ? '.' + c.split(' ').join('.') : ''}`;
        } catch {
          html = '?';
        }
      }
      issues.push(`名前が空: role=${role} ${html}`);
    }
  }
  if (main !== 1) issues.push(`main が ${main} 個`);
  if (h1 !== 1) issues.push(`h1 が ${h1} 個`);
  await cdp.detach();
  return issues;
}

for (const [label, vp, mobile] of [['pc', { width: 1280, height: 800 }, false], ['sp', { width: 390, height: 844 }, true]] as const) {
  test.describe(`E-05 AX ${label}`, () => {
    test.use({ viewport: vp, isMobile: mobile, hasTouch: mobile });
    for (const s of SCENES) {
      if (!appliesTo(s, mobile)) continue;
      test(s.id, async ({ page }) => {
        await s.open(page, mobile);
        await page.waitForTimeout(250);
        const lang = await page.evaluate(() => document.documentElement.lang);
        const issues = await axIssues(page);
        if (lang !== 'ja') issues.push(`html lang="${lang}"`);
        writeFileSync(`${OUT}/${label}__${s.id}.json`, JSON.stringify({ label, scene: s.id, issues }, null, 1));
        // モーダルを開いている場面は、背後の main が隠れる（aria-modal）ので main と h1 の数は見ない
        const filtered = s.overlay ? issues.filter((i) => !/^(main|h1) /.test(i)) : issues;
        expect(filtered).toEqual([]);
      });
    }
  });
}
