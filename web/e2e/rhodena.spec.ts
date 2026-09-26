import { expect,test, type Page } from '@playwright/test';
async function isolateExternal(page:Page){
  await page.route('https://**/*',route=>{
    if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e5ebde"/></svg>'});
    if(route.request().url().includes('/query')||route.request().url().includes('.geojson'))return route.fulfill({json:{type:'FeatureCollection',features:[]}});
    return route.fulfill({contentType:'text/css',body:''});
  });
}
for(const width of [1440,390])test(`Rhodena sources, layers and visibility at ${width}px`,async({page})=>{
  test.setTimeout(120000);
  await page.setViewportSize({width,height:width===390?844:1000});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem('ns-marks-the-spot:province-license:v1','accepted'));
  await isolateExternal(page);
  await page.goto('/?theme=rhodena&basemap=osm');
  await expect(page).toHaveTitle(/NS Marks The Spot/);
  if(width===1440){await page.getByRole('button',{name:'T1 · proposed turbine',exact:true}).press('Enter');await expect(page.locator('.leaflet-popup')).toContainText('up to 200 m above ground');await page.locator('.leaflet-popup-close-button').click();}
  if(width===390){await page.getByRole('button',{name:'Search & layers',exact:true}).click();await page.getByRole('button',{name:/^Rhodena Wind Project/}).click();}
  await expect(page.getByText('Rhodena · 2024 assessed proposal',{exact:true})).toBeVisible();
  await page.getByText('Project status & evidence gaps',{exact:true}).click();
  await expect(page.getByText(/Two substation locations:/)).toBeVisible();
  await expect(page.getByText(/report withholds their IDs/)).toBeVisible();
  await page.getByText('Project status & evidence gaps',{exact:true}).click();
  await page.getByText('Rhodena · illustrative 1 km rings',{exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Rhodena · illustrative 1 km rings',exact:true})).toBeChecked();
  await page.getByText('Rhodena · assessment receptors',{exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Rhodena · assessment receptors',exact:true})).toBeChecked();
  await page.getByText('Rhodena · turbine visibility',{exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Rhodena · turbine visibility',exact:true})).toBeChecked();
  if(width===390)await page.getByRole('button',{name:'Show Rhodena area',exact:true}).click();
  await expect(page.locator('.rhodena-viewshed-raster')).toBeVisible({timeout:90000});
  await expect(page.getByRole('combobox',{name:'Viewshed turbine'})).toHaveValue('T1');
  await page.getByRole('combobox',{name:'Viewshed turbine'}).selectOption('T6');
  await expect(page.getByText('T6: preliminary 200 m blade-tip visibility',{exact:true})).toBeVisible({timeout:90000});
  await page.getByRole('button',{name:'Choose a viewpoint',exact:true}).click();
  await expect(page.getByRole('button',{name:'Cancel viewpoint',exact:true})).toBeVisible();
  const map=page.locator('.leaflet-container').first();const bounds=await map.boundingBox();
  await map.click({position:{x:Math.min(150,bounds!.width*.3),y:bounds!.height*.4}});
  await expect(page.getByText('Turbines from this viewpoint',{exact:true})).toBeVisible();
  await expect(page.locator('.rhodena-viewpoint-results li')).toHaveCount(6);
  await expect(page.getByText(/This point stays in this browser/)).toBeVisible();
  await page.getByRole('button',{name:'Clear point',exact:true}).click();
  await expect(page.locator('.rhodena-viewpoint-results')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.screenshot({path:`/tmp/rhodena-${width}.png`});
  expect(errors).toEqual([]);
});

test('explicit shared position survives the named Rhodena setup',async({page})=>{
  await isolateExternal(page);
  await page.goto('/?theme=rhodena&layers=modern,rhodena-turbines&taxSale=off&position=45.8,-61.4,13&basemap=osm');
  await expect(page.locator('.position-readout')).toContainText('45.800');
  // The URL's explicit layer selection must not silently enable the study or analysis.
  await expect(page.locator('.rhodena-viewshed-raster')).toHaveCount(0);
  await expect(page.locator('.leaflet-rhodena-rhodena-study-pane')).toHaveCount(0);
});


test('Rhodena terrain failure stays unassessed and can be retried',async({page})=>{
  await isolateExternal(page);
  await page.route('**/rhodena/terrain.bin',route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.goto('/?layers=modern,rhodena-visibility&taxSale=off&basemap=osm');
  await expect(page.getByText(/Terrain could not be loaded or verified/)).toBeVisible();
  await expect(page.locator('.rhodena-viewshed-raster')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Choose a viewpoint',exact:true})).toBeDisabled();
  await page.unroute('**/rhodena/terrain.bin');
  await page.getByRole('button',{name:'Retry terrain',exact:true}).click();
  await expect(page.locator('.rhodena-viewshed-raster')).toBeVisible({timeout:30000});
});
