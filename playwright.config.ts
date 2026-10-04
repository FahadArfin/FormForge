import {defineConfig,devices} from '@playwright/test'
export default defineConfig({
 testDir:'./e2e',timeout:60_000,expect:{timeout:20_000},fullyParallel:false,workers:1,retries:1,
 reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 projects:[{name:'desktop-chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:960}}},{name:'phone-chromium',use:{...devices['Pixel 7']}}],
 webServer:{command:'node scripts/preview-built.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:30_000},
})
