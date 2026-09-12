import { expect, test } from "@playwright/test";
import { gzipSync } from "node:zlib";

const civic = { type:"FeatureCollection", features:[{ type:"Feature", geometry:{type:"Point",coordinates:[-61.4,45.8]}, properties:{pntid:"mailing-fixture",civicnum:"117",strname:"Example",strsuffix:"Rd",comm:"Long Point",county:"Inverness"} }] };
const record = {id:"synthetic-nar",number:"117",suffix:"",unit:"",road:"Example RD",street:"EXAMPLE RD",city:"JUDIQUE",postalCode:"B0E1P0",additional:"RR 1",coordinates:[-61.400002,45.800009]};
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#9aa78d"/></svg>';
for (const mode of ['poker','explore-nova-scotia']) {
for (const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
  test(`postal community resolves to civic address in ${mode} at ${viewport.width}px`, async ({page},testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if(m.type()==='error')errors.push(m.text()); });
    await page.addInitScript(() => localStorage.setItem('ns-marks-the-spot:province-license:v1','accepted'));
    await page.route('**/mailing-addresses/*.json.gz',route => route.fulfill({contentType:'application/gzip',body:gzipSync(JSON.stringify(route.request().url().includes('index') ?
      {version:1,streets:[{key:'example rd',cities:['JUDIQUE']}]} : {version:1,streets:{'example rd':[record]}}))}));
    await page.route('https://**/*',route => {
      const url = new URL(route.request().url());
      if(url.pathname.includes('tntn-er5g')) return route.fulfill({json: url.searchParams.get('$where')?.includes('within_box') ? civic : {type:'FeatureCollection',features:[]}});
      if(url.pathname.includes('NSPRD') && url.pathname.endsWith('/query'))return route.fulfill({json:{type:'FeatureCollection',features:[{type:'Feature',properties:{PID:'12345678'},geometry:{type:'Polygon',coordinates:[[[-61.401,45.799],[-61.399,45.799],[-61.399,45.801],[-61.401,45.801],[-61.401,45.799]]]}}]}});
      if(url.pathname.includes('/query'))return route.fulfill({json:{type:'FeatureCollection',features:[]}});
      if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:tile});
      return route.fulfill({body:'',contentType:'text/css'});
    });
    await page.goto('/?basemap=osm');
    await expect(page).toHaveTitle(/NS Marks The Spot/);
    if(viewport.width<=860)await page.getByRole('button',{name:'Search & layers',exact:true}).click();
    await page.getByRole('combobox',{name:'Map setup',exact:true}).selectOption(mode);
    const input = page.getByRole('combobox',{name:'Search by PID or civic address'});
    await input.fill('117 Example Road Judique');
    await page.getByRole('button',{name:'Find parcel',exact:true}).click();
    const option=page.getByRole('option',{name:/117 Example Rd, Long Point/});
    await expect(option).toContainText('Mailing: 117 EXAMPLE RD, JUDIQUE, NS B0E 1P0');
    await expect(option).toBeInViewport();
    await page.screenshot({path:testInfo.outputPath('mailing-search.png')});
    await input.press('ArrowDown');
    await input.press('Enter');
    if(mode==='poker') {
      await expect(input).toHaveValue('117 Example Rd, Long Point, Inverness');
      await expect(page.locator('.poker-civic-number')).toContainText('117');
    } else {
      const evidence=page.getByRole('region',{name:'Mailing address evidence'});
      await expect(evidence).toContainText('Mailing: 117 EXAMPLE RD, JUDIQUE, NS B0E 1P0');
      await evidence.scrollIntoViewIfNeeded();
      await expect(evidence).toBeInViewport();
      await expect(evidence).toContainText('Additional delivery information: RR 1');
      await evidence.locator('.mailing-source summary').click();
      await expect(evidence.getByText(/This does not constitute an endorsement/)).toBeVisible();
      await page.screenshot({path:testInfo.outputPath('mailing-inspector.png')});
    }
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

}
