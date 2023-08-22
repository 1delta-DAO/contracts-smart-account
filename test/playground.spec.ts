import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { constants } from 'ethers';
import { ethers, network } from 'hardhat'


// we prepare a setup for compound in hardhat
// this series of tests checks that the features used for the margin swap implementation
// are correctly set up and working
describe('Test Binance API', async () => {
    let deployer: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress, carol: SignerWithAddress, gabi: SignerWithAddress, achi: SignerWithAddress;


    before('Deploy Account, Trader, Uniswap and Compound', async () => {
        [deployer, alice, bob, carol, gabi, achi] = await ethers.getSigners();


    })
    const parseParams = (a: any) => {
        return Object.entries(a).map(([k, v]: [any, any]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    }
    it('test fetch', async () => {
        const body = {
            "chainId": 56,
            "tradeType": "SELL",
            "src": "0x8fF795a6F4D97E7887C79beA79aba5cc76444aDf",
            "srcDecimals": 18,
            "srcSymbol": "BCH",
            "amount": "12000000000000000000",
            "dst": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
            "dstDecimals": 18,
            "dstSymbol": "WBNB"


        }
        console.log("params", parseParams(body))
        const data = await fetch(`http://127.0.0.1:8787/v0/quote/?${parseParams(body)}`)
        const res = await data.json()
        console.log("Tsst", res)
    })
})


// ·----------------------------------------------------------------------------------------------|---------------------------|-----------------|-----------------------------·
// |                                     Solc version: 0.8.21                                     ·  Optimizer enabled: true  ·  Runs: 1000000  ·  Block limit: 30000000 gas  │
// ·······························································································|···························|·················|······························
// ························································|······································|·············|·············|·················|···············|··············
// |  OneDeltaAccount                                      ·  multicall                           ·     559946  ·    1031548  ·         795747  ·            2  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············




