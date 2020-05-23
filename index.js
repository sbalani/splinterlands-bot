//'use strict';
require('dotenv').config()
var cron = require('node-cron');
const ask = require('./possibleTeams');
const puppeteer = require('puppeteer');


async function login(page) {
    try {
        page.waitForSelector('#log_in_button > button').then(() => page.click('#log_in_button > button'))
        await page.waitForSelector('#account')
            .then(() => page.waitFor(3000))
            .then(() => page.focus('#account'))
            .then(() => page.type('#account', process.env.ACCOUNT))
            .then(() => page.focus('#key'))
            .then(() => page.type('#key', process.env.PASSWORD))
            .then(() => page.click('#btn_login'))
            .then(() => page.waitFor(5000)
                .then(() => page.waitForSelector('.modal-close-new', { timeout: 10000 }))
                .then(() => page.click('.modal-close-new'))
            )

    } catch (e) {
        console.log('login error', e);
    }
}

async function makeTeam(page) {
    //TBD
}

async function checkMana(page) {
    var manas = await page.evaluate(() => {
        var manaCap = document.querySelectorAll('div.mana-total > span.mana-cap')[0].innerText;
        var manaUsed = document.querySelectorAll('div.mana-total > span.mana-used')[0].innerText;
        var manaLeft = manaCap - manaUsed
        return { manaCap, manaUsed, manaLeft };
    });
    console.log('manaLimit', manas);
    return manas;
}

async function checkMatchMana(page) {
    const mana = await page.$$eval("div.col-md-12 > div.mana-cap__icon", el => el.map(x => x.getAttribute("data-original-title")));
    const manaValue = parseInt(mana[0].split(':')[1], 10);
    console.log(manaValue);
    return manaValue;
}

async function checkMatchRules(page) {
    const rules = await page.$$eval("div.col-md-12 > img", el => el.map(x => x.getAttribute("data-original-title")));
    return rules.map(x => x.split(':')[0]).join('|')
}

const splinterIsActive = (splinterUrl) => {
    const splinter = splinterUrl.split('/').slice(-1)[0].replace('.svg', '').replace('icon_splinter_', '');
    return splinter.indexOf('inactive') === -1 ? splinter : '';
}

async function checkMatchActiveSplinters(page) {
    const splinterUrls = await page.$$eval("div.col-sm-4 > img", el => el.map(x => x.getAttribute("src")));
    return splinterUrls.map(splinter => splinterIsActive(splinter)).filter(x => x);
}

const makeCardId = (id) => '#card_' + id;


async function openSplinter() {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.setViewport({
        width: 1200,
        height: 800,
        deviceScaleFactor: 1,
    });

    await page.goto('https://splinterlands.io/');
    await page.waitFor(4000);
    await login(page);
    await page.waitFor(10000);

    //READ DAILY QUEST span#questDescription

    // LAUNCH the battle
    const [button] = await page.$x("//button[contains(., 'RANKED')]");
    button ? await button.click() : null;
    await page.waitFor(30000);

    const [button2] = await page.$x("//button[contains(., 'MAKE TEAM')]");
    button2 ? await button2.click() : null;
    await page.waitFor(5000);

    await page.waitForSelector('.btn--create-team', { timeout: 90000 })
        //then read rules and details 
        .then(async () => {
            let [mana, rules, splinters] = await Promise.all([
                checkMatchMana(page).then((mana) => mana).catch(() => 'no mana'),
                checkMatchRules(page).then((rulesArray) => rulesArray).catch(() => 'no rules'),
                checkMatchActiveSplinters(page).then((splinters) => splinters).catch(() => 'no splinters')
            ]);
            console.log('check: ', mana, rules, splinters);
            return { mana: mana, rules: rules, splinters: splinters }
        })
        .then((matchDetails) => [ask.possibleTeams(matchDetails), matchDetails])
        .then(([possibleTeams, matchDetails]) => {
            if (possibleTeams) {
                page.click('.btn--create-team')[0];
                return [possibleTeams, matchDetails]
            }
            page.click('.btn--surrender')[0]
        })
        .then(([possibleTeams, matchDetails]) => { console.log('rules and possible teams: ', matchDetails, possibleTeams, possibleTeams.length); if (possibleTeams.length !== 0) { return [possibleTeams, matchDetails] } else { console.log('NO TEAMS') }; })
        .then(([possibleTeams, matchDetails]) => {

            if (matchDetails.splinters.includes('fire') && possibleTeams.find(x => x[7] === 'fire')) {
                const fireTeam = possibleTeams.find(x => x[7] === 'fire')
                console.log('PLAY FIRE: ', fireTeam, matchDetails)
                const summoner = makeCardId(fireTeam[0].toString());
                return [summoner, fireTeam];
            }

            let i = 0;
            while (i <= possibleTeams.length - 1) {
                if (possibleTeams[i][7] !== 'dragon' && matchDetails.splinters.includes(possibleTeams[i][7])) {
                    console.log('SELECTED: ', possibleTeams[i]);
                    const summoner = makeCardId(possibleTeams[i][0].toString());
                    return [summoner, possibleTeams[i]]
                }
                console.log('DISCARDED: ', possibleTeams[i])
                i++;
            }
            throw new Error('no team available to be played');
        }) //select 
        .then(async ([summoner, team]) => {
            await page.waitForSelector(summoner);
            await page.click(summoner);
            await page.waitForSelector(makeCardId(team[1].toString()));
            await page.click(makeCardId(team[1].toString()));
            await page.waitFor(1000);
            await team[2] ? page.click(makeCardId(team[2].toString())) : console.log('nocard 2');
            await page.waitFor(1000);
            await team[3] ? page.click(makeCardId(team[3].toString())) : console.log('nocard 3');
            await page.waitFor(1000);
            await team[4] ? page.click(makeCardId(team[4].toString())) : console.log('nocard 4');
            await page.waitFor(1000);
            await team[5] ? page.click(makeCardId(team[5].toString())) : console.log('nocard 5');
            await page.waitFor(1000);
            await team[6] ? page.click(makeCardId(team[6].toString())) : console.log('nocard 6');
        })
        .then(() => page.waitFor(5000))
        .then(() => page.click('.btn-green')[0]) //start fight
        .then(() => page.waitFor(5000))
        .then(() => browser.close())
        .catch((e) => { console.log('Error: ', e); browser.close() })
    await browser.close()
}

// cron.schedule('*/4 * * * *', () => {
//     try {
//         openSplinter();
//     }
//     catch (e) {
//         console.log('END Error: ', e);
//     }
// });

openSplinter();