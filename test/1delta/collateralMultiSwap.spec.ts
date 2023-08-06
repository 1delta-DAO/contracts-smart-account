import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { constants } from 'ethers';
import { ethers, network } from 'hardhat'
import {
    MarginTraderModule
} from '../../types';
import { FeeAmount } from '../uniswap-v3/periphery/shared/constants';
import { expandTo18Decimals } from '../uniswap-v3/periphery/shared/expandTo18Decimals';
import { encodePath } from '../uniswap-v3/periphery/shared/path';
import {
    accountFactoryFixture,
    AccountFactoryFixture,
    borrowFromCompound,
    createMarginTradingAccount,
    enterMarkets,
    feedCompound,
    feedProvider,
    getAbsoluteMarginTraderAccount,
    getMoneyMarketContract,
    supplyToCompound
} from './shared/accountFactoryFixture';
import { encodeAggregtorPathEthers } from './shared/aggregatorPath';
import { expectToBeLess } from './shared/checkFunctions';
import { CompoundFixture, CompoundOptions, generateCompoundFixture } from './shared/compoundFixture';
import { expect } from './shared/expect'
import { ONE_18 } from './shared/marginSwapFixtures';
import { addLiquidity, uniswapFixture, UniswapFixture } from './shared/uniswapFixture';


// we prepare a setup for compound in hardhat
// this series of tests checks that the features used for the margin swap implementation
// are correctly set up and working
describe('Collateral Multi Swap operations', async () => {
    let deployer: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress, carol: SignerWithAddress, gabi: SignerWithAddress, achi: SignerWithAddress;
    let uniswap: UniswapFixture
    let compound: CompoundFixture
    let opts: CompoundOptions
    let accountAlice: MarginTraderModule
    let accountBob: MarginTraderModule
    let accountAchi: MarginTraderModule
    let accountGabi: MarginTraderModule
    let accountFixture: AccountFactoryFixture

    before('Deploy Account, Trader, Uniswap and Compound', async () => {
        [deployer, alice, bob, carol, gabi, achi] = await ethers.getSigners();

        uniswap = await uniswapFixture(deployer, 5)


        opts = {
            underlyings: uniswap.tokens,
            collateralFactors: uniswap.tokens.map(x => ONE_18.mul(5).div(10)),
            exchangeRates: uniswap.tokens.map(x => ONE_18),
            borrowRates: uniswap.tokens.map(x => ONE_18),
            cEthExchangeRate: ONE_18,
            cEthBorrowRate: ONE_18,
            compRate: ONE_18,
            closeFactor: ONE_18
        }

        // approve & fund wallets
        for (const token of uniswap.tokens) {
            await token.approve(uniswap.router.address, constants.MaxUint256)
            await token.approve(uniswap.nft.address, constants.MaxUint256)

            await token.connect(bob).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(bob).approve(uniswap.nft.address, constants.MaxUint256)
            await token.connect(alice).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(alice).approve(uniswap.nft.address, constants.MaxUint256)
            await token.connect(carol).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(carol).approve(uniswap.nft.address, constants.MaxUint256)

            await token.connect(bob).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(alice).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(carol).approve(uniswap.router.address, constants.MaxUint256)

            await token.connect(deployer).transfer(bob.address, expandTo18Decimals(1_000_000))
            await token.connect(deployer).transfer(alice.address, expandTo18Decimals(1_000_000))
            await token.connect(deployer).transfer(carol.address, expandTo18Decimals(1_000_000))
            await token.connect(deployer).transfer(achi.address, expandTo18Decimals(1_000_000))
            await token.connect(deployer).transfer(gabi.address, expandTo18Decimals(1_000_000))

            await token.connect(deployer).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(bob).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(carol).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(alice).approve(uniswap.router.address, constants.MaxUint256)
        }

        compound = await generateCompoundFixture(deployer, opts)

        accountFixture = await accountFactoryFixture(deployer, uniswap.factory, uniswap.weth9, compound.cEther.address)

        accountAlice = await createMarginTradingAccount(alice, accountFixture)

        accountBob = await createMarginTradingAccount(bob, accountFixture)

        accountAchi = await createMarginTradingAccount(achi, accountFixture)

        accountGabi = await createMarginTradingAccount(gabi, accountFixture)

        await accountFixture.dataProvider.addComptroller(compound.comptroller.address)

        console.log("add 0 1")
        await addLiquidity(
            deployer,
            uniswap.tokens[0].address,
            uniswap.tokens[1].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        console.log("add 1 2")
        await addLiquidity(
            deployer,
            uniswap.tokens[1].address,
            uniswap.tokens[2].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        console.log("add 2 3")
        await addLiquidity(
            deployer,
            uniswap.tokens[2].address,
            uniswap.tokens[3].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        console.log("add 3 4")
        await addLiquidity(
            deployer,
            uniswap.tokens[3].address,
            uniswap.tokens[4].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        // add pools
        let poolAddress = await uniswap.factory.getPool(uniswap.tokens[0].address, uniswap.tokens[1].address, FeeAmount.MEDIUM)
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[0].address, uniswap.tokens[1].address, FeeAmount.MEDIUM, poolAddress)

        poolAddress = await uniswap.factory.getPool(uniswap.tokens[1].address, uniswap.tokens[2].address, FeeAmount.MEDIUM)
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[1].address, uniswap.tokens[2].address, FeeAmount.MEDIUM, poolAddress)

        poolAddress = await uniswap.factory.getPool(uniswap.tokens[2].address, uniswap.tokens[3].address, FeeAmount.MEDIUM)
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[2].address, uniswap.tokens[3].address, FeeAmount.MEDIUM, poolAddress)

        await accountFixture.dataProvider.setNativeWrapper(uniswap.weth9.address)
        await accountFixture.dataProvider.setRouter(uniswap.router.address)


        await feedProvider(deployer, accountFixture, uniswap, compound)
        await feedCompound(deployer, uniswap, compound)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)
        await enterMarkets(bob, accountBob.address, compound)
        await enterMarkets(achi, accountAchi.address, compound)
        await enterMarkets(gabi, accountGabi.address, compound)

        let mmC = await getMoneyMarketContract(accountAlice.address)
        await (mmC.connect(alice)).approveUnderlyings(uniswap.tokens.map(t => t.address))

        mmC = await getMoneyMarketContract(accountBob.address)
        await (mmC.connect(bob)).approveUnderlyings(uniswap.tokens.map(t => t.address))

        mmC = await getMoneyMarketContract(accountAchi.address)
        await (mmC.connect(achi)).approveUnderlyings(uniswap.tokens.map(t => t.address))

        mmC = await getMoneyMarketContract(accountGabi.address)
        await (mmC.connect(gabi)).approveUnderlyings(uniswap.tokens.map(t => t.address))


    })

    it('allows loan swap borrow exact in', async () => {
        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 1
        const borrowAmount_0 = expandTo18Decimals(200)
        const borrowTokenIndex_0 = 0

        const borrowAmount_1 = expandTo18Decimals(200)
        const borrowTokenIndex_1 = 3

        const routeIndexes = [0, 1, 2, 3]
        await supplyToCompound(alice, accountAlice.address, supplyTokenIndex, supplyAmount, uniswap)

        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex_0, borrowAmount_0, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex_1, borrowAmount_1, uniswap)

        const swapAmount = expandTo18Decimals(50)

        let _tokensInRoute = routeIndexes.map(t => uniswap.tokens[t].address)
        // const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregtorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [7, 0, 0], // action
            [0, 0, 0], // pid
            6 // flag
        )
        const params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: swapAmount.mul(99).div(100)
        }

        await accountAlice.connect(alice).swapBorrowExactIn(params.amountIn, params.amountOutMinimum, params.path)

        const borrow0 = await compound.cTokens[borrowTokenIndex_0].callStatic.borrowBalanceCurrent(accountAlice.address)
        const borrow1 = await compound.cTokens[borrowTokenIndex_1].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(borrow0.toString()).to.equal(borrowAmount_0.add(swapAmount).toString())
    })

    it('allows loan swap borrow exact out', async () => {
        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 1
        const borrowAmount_0 = expandTo18Decimals(100)
        const borrowTokenIndex_0 = 0

        const borrowAmount_1 = expandTo18Decimals(100)
        const borrowTokenIndex_1 = 3

        const routeIndexes = [0, 1, 2, 3]
        await supplyToCompound(bob, accountBob.address, supplyTokenIndex, supplyAmount, uniswap)

        await borrowFromCompound(bob, accountBob.address, borrowTokenIndex_0, borrowAmount_0, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        await borrowFromCompound(bob, accountBob.address, borrowTokenIndex_1, borrowAmount_1, uniswap)

        const swapAmount = expandTo18Decimals(50)

        let _tokensInRoute = routeIndexes.map(t => uniswap.tokens[t].address).reverse()
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregtorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [3, 1, 1], // action
            [0, 0, 0], // pid
            6 // flag
        )
        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(105).div(100)
        }

        const borrow0Pre = await compound.cTokens[borrowTokenIndex_0].callStatic.borrowBalanceCurrent(accountBob.address)
        const borrow1Pre = await compound.cTokens[borrowTokenIndex_1].callStatic.borrowBalanceCurrent(accountBob.address)


        await accountBob.connect(bob).swapBorrowExactOut(params.amountOut, params.amountInMaximum, params.path)

        const borrow0 = await compound.cTokens[borrowTokenIndex_0].callStatic.borrowBalanceCurrent(accountBob.address)
        const borrow1 = await compound.cTokens[borrowTokenIndex_1].callStatic.borrowBalanceCurrent(accountBob.address)

        expect(borrow1Pre.sub(borrow1).toString()).to.equal(borrowAmount_1.sub(swapAmount).toString())
    })

    it('allows collateral swap exact in', async () => {
        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndexFrom = 0
        const borrowAmount = expandTo18Decimals(400)
        const borrowTokenIndex = 1

        const routeIndexes = [0, 1, 2, 3]

        await supplyToCompound(achi, accountAchi.address, supplyTokenIndexFrom, supplyAmount, uniswap)
        await borrowFromCompound(achi, accountAchi.address, borrowTokenIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(900)


        let _tokensInRoute = routeIndexes.map(t => uniswap.tokens[t].address)
        // const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregtorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [6, 0, 0], // action
            [0, 0, 0], // pid
            5// flag
        )
        const params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: swapAmount.mul(95).div(100)
        }

        await accountAchi.connect(achi).swapCollateralExactIn(params.amountIn, params.amountOutMinimum, params.path)

        const supply0 = await compound.cTokens[supplyTokenIndexFrom].callStatic.balanceOfUnderlying(accountAchi.address)
        expect(supply0.toString()).to.equal(supplyAmount.sub(swapAmount))
    })

    it('allows collateral swap exact out', async () => {
        const supplyAmountFrom = expandTo18Decimals(1_000)

        const supplyTokenIndexFrom = 0
        const supplyTokenIndexTo = 3
        const borrowAmount = expandTo18Decimals(400)
        const borrowTokenIndex = 1

        const routeIndexes = [0, 1, 2, 3]

        await supplyToCompound(gabi, accountGabi.address, supplyTokenIndexFrom, supplyAmountFrom, uniswap)

        await borrowFromCompound(gabi, accountGabi.address, borrowTokenIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(900)


        let _tokensInRoute = routeIndexes.map(t => uniswap.tokens[t].address).reverse()
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregtorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [4, 1, 1], // action
            [0, 0, 0], // pid
            3 // flag
        )
        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(105).div(100)
        }

        await accountGabi.connect(gabi).swapCollateralExactOut(params.amountOut, params.amountInMaximum, params.path)


        const supply1 = await compound.cTokens[supplyTokenIndexTo].balanceOf(accountGabi.address)
        expect(supply1.toString()).to.equal(swapAmount)
    })

    it('allows collateral swap all in', async () => {
        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndexFrom = 0
        const borrowAmount = expandTo18Decimals(400)
        const borrowTokenIndex = 1
        const supplyTokenIndexTo = 3
        const routeIndexes = [0, 1, 2, 3]
        accountAchi = await createMarginTradingAccount(achi, accountFixture, true)
        await supplyToCompound(achi, accountAchi.address, supplyTokenIndexFrom, supplyAmount, uniswap)
        await borrowFromCompound(achi, accountAchi.address, borrowTokenIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(900)


        let _tokensInRoute = routeIndexes.map(t => uniswap.tokens[t].address)
        // const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const supply0Before = await compound.cTokens[supplyTokenIndexFrom].callStatic.balanceOfUnderlying(accountAchi.address)
        const supply1Before = await compound.cTokens[supplyTokenIndexTo].callStatic.balanceOfUnderlying(accountAchi.address)
        const path = encodeAggregtorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [6, 0, 0], // action
            [0, 0, 0], // pid
            5// flag
        )
        const params = {
            path,
            amountOutMinimum: supply1Before.mul(99).div(100)
        }
        const accountAlt = await getAbsoluteMarginTraderAccount(achi, accountAchi.address)
        await accountAlt.connect(achi).swapCollateralAllIn(params.amountOutMinimum, params.path)

        const supply0 = await compound.cTokens[supplyTokenIndexFrom].callStatic.balanceOfUnderlying(accountAchi.address)
        const supply1 = await compound.cTokens[supplyTokenIndexTo].callStatic.balanceOfUnderlying(accountAchi.address)
        expect(supply0.toString()).to.equal('0')
        // expect(supply0.toString()).to.equal(supplyAmount.sub(swapAmount))
        expectToBeLess(supply1, supply0Before)
        expectToBeLess(supply0Before, supply1, 0.97)
    })

    it('allows loan swap borrow all out', async () => {
        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 1
        const borrowAmount_0 = expandTo18Decimals(100)
        const borrowTokenIndex_0 = 0

        const borrowAmount_1 = expandTo18Decimals(100)
        const borrowTokenIndex_1 = 3

        const routeIndexes = [0, 1, 2, 3]
        accountBob = await createMarginTradingAccount(bob, accountFixture, true)
        await supplyToCompound(bob, accountBob.address, supplyTokenIndex, supplyAmount, uniswap)

        await borrowFromCompound(bob, accountBob.address, borrowTokenIndex_0, borrowAmount_0, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        await borrowFromCompound(bob, accountBob.address, borrowTokenIndex_1, borrowAmount_1, uniswap)

        let _tokensInRoute = routeIndexes.map(t => uniswap.tokens[t].address).reverse()
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))


        const borrow0Pre = await compound.cTokens[borrowTokenIndex_0].callStatic.borrowBalanceCurrent(accountBob.address)
        const borrow1Pre = await compound.cTokens[borrowTokenIndex_1].callStatic.borrowBalanceCurrent(accountBob.address)
        const path = encodeAggregtorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [3, 1, 1], // action
            [0, 0, 0], // pid
            6 // flag
        )

        const params = {
            path,
            amountInMaximum: borrow1Pre.mul(105).div(100),
        }


        const accountAlt = await getAbsoluteMarginTraderAccount(bob, accountBob.address)

        await accountAlt.connect(bob).swapBorrowAllOut(params.amountInMaximum, params.path)

        const borrow0 = await compound.cTokens[borrowTokenIndex_0].callStatic.borrowBalanceCurrent(accountBob.address)
        const borrow1 = await compound.cTokens[borrowTokenIndex_1].callStatic.borrowBalanceCurrent(accountBob.address)

        expect(borrow1.toString()).to.equal('0')
        expectToBeLess(borrow1Pre.sub(borrow1), borrow0Pre, 0.99)
        expectToBeLess(borrow0Pre, borrow1Pre.sub(borrow1))
    })

    it('single side multi gatekeep', async () => {
        const routeIndexes = [0, 1, 2, 3]
        const errorMessage = 'Only the account owner can interact.'
        const swapAmount = expandTo18Decimals(50)

        let _tokensInRoute = routeIndexes.map(t => uniswap.tokens[t].address)
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256
        }

        await expect(
            accountAlice.connect(bob).swapBorrowExactIn(params.amountIn, params.amountOutMinimum, params.path)
        ).to.be.revertedWith(errorMessage)

        const paramswapBorrowExactOut = {
            path,
            amountOut: swapAmount,
            amountInMaximum: constants.MaxUint256
        }
        await expect(
            accountBob.connect(alice).swapBorrowExactOut(paramswapBorrowExactOut.amountOut, paramswapBorrowExactOut.amountInMaximum, paramswapBorrowExactOut.path)
        ).to.be.revertedWith(errorMessage)

        let accountAlt = await getAbsoluteMarginTraderAccount(bob, accountBob.address)
        await expect(
            accountAlt.connect(alice).swapBorrowAllOut(paramswapBorrowExactOut.amountInMaximum, paramswapBorrowExactOut.path)
        ).to.be.revertedWith(errorMessage)


        const paramswapCollateralExactIn = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: 0
        }
        await expect(
            accountAchi.connect(gabi).swapCollateralExactIn(paramswapCollateralExactIn.amountIn, paramswapCollateralExactIn.amountOutMinimum, paramswapCollateralExactIn.path)
        ).to.be.revertedWith(errorMessage)

        accountAlt = await getAbsoluteMarginTraderAccount(achi, accountAchi.address)

        await expect(
            accountAlt.connect(gabi).swapCollateralAllIn(params.amountOutMinimum, params.path)
        ).to.be.revertedWith(errorMessage)


        const paramswapCollateralExactOut = {
            path,
            amountOut: swapAmount,
            amountInMaximum: constants.MaxUint256
        }
        await expect(
            accountGabi.connect(achi).swapCollateralExactOut(paramswapCollateralExactOut.amountOut, paramswapCollateralExactOut.amountInMaximum, paramswapCollateralExactOut.path)
        ).to.be.revertedWith(errorMessage)
    })

})

// ·----------------------------------------------------------------------------------------------|---------------------------|-----------------|-----------------------------·
// |                                     Solc version: 0.8.21                                     ·  Optimizer enabled: true  ·  Runs: 1000000  ·  Block limit: 30000000 gas  │
// ·······························································································|···························|·················|······························
// |  Methods                                                                                                                                                                 │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  swapBorrowExactIn                   ·          -  ·          -  ·         681081  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  swapBorrowExactOut                  ·          -  ·          -  ·         595245  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  swapCollateralExactIn               ·          -  ·          -  ·         638780  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  swapCollateralExactOut              ·          -  ·          -  ·         624213  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  swapBorrowAllOut                    ·          -  ·          -  ·         627205  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  swapCollateralAllIn                 ·          -  ·          -  ·         674304  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············



