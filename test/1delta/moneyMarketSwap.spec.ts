import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { MockProvider } from 'ethereum-waffle';
import { constants } from 'ethers';
import { ethers, network, waffle } from 'hardhat'
import {
    MoneyMarketModule
} from '../../types';
import { FeeAmount } from '../uniswap-v3/periphery/shared/constants';
import { expandTo18Decimals } from '../uniswap-v3/periphery/shared/expandTo18Decimals';
import { encodePath } from '../uniswap-v3/periphery/shared/path';
import {
    accountFactoryFixture,
    AccountFactoryFixture,
    borrowFromCompound,
    createMoneyMarketAccount,
    enterMarkets,
    feedCompound,
    feedProvider,
    getAbsoluteMarginTraderAccount,
    getMoneyMarketContract,
    supplyToCompound
} from './shared/accountFactoryFixture';
import { expectToBeLess } from './shared/checkFunctions';
import { CompoundFixture, CompoundOptions, generateCompoundFixture } from './shared/compoundFixture';
import { expect } from './shared/expect'
import { ONE_18 } from './shared/marginSwapFixtures';
import { addLiquidity, uniswapFixture, UniswapFixture } from './shared/uniswapFixture';


// we prepare a setup for compound in hardhat
// this series of tests checks that the features used for the margin swap implementation
// are correctly set up and working
describe('Money Market Multi Swap operations', async () => {
    let deployer: SignerWithAddress
    let alice: SignerWithAddress
    let bob: SignerWithAddress
    let carol: SignerWithAddress
    let gabi: SignerWithAddress
    let achi: SignerWithAddress;
    let uniswap: UniswapFixture
    let compound: CompoundFixture
    let opts: CompoundOptions
    let accountAlice: MoneyMarketModule
    let accountCarol: MoneyMarketModule
    let accountBob: MoneyMarketModule
    let accountAchi: MoneyMarketModule
    let accountGabi: MoneyMarketModule
    let accountFixture: AccountFactoryFixture
    let wethAddress: string
    let tokenAddresses: string[]
    let provider: MockProvider

    before('Deploy Account, Trader, Uniswap and Compound', async () => {

        provider = waffle.provider;

        [deployer, alice, bob, carol, gabi, achi] = await ethers.getSigners();

        uniswap = await uniswapFixture(deployer, 5)




        opts = {
            underlyings: uniswap.tokens,
            collateralFactors: uniswap.tokens.map(x => ONE_18.mul(7).div(10)),
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

        accountAlice = await createMoneyMarketAccount(alice, accountFixture)

        accountBob = await createMoneyMarketAccount(bob, accountFixture)

        accountAchi = await createMoneyMarketAccount(achi, accountFixture)

        accountGabi = await createMoneyMarketAccount(gabi, accountFixture)

        accountCarol = await createMoneyMarketAccount(carol, accountFixture)

        await accountFixture.dataProvider.addComptroller(compound.comptroller.address)

        await uniswap.weth9.connect(deployer).approve(uniswap.nft.address, constants.MaxUint256)
        await uniswap.weth9.connect(deployer).deposit({ value: expandTo18Decimals(1_000) })


        await addLiquidity(
            deployer,
            uniswap.tokens[0].address,
            uniswap.tokens[1].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        await addLiquidity(
            deployer,
            uniswap.tokens[1].address,
            uniswap.tokens[2].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        await addLiquidity(
            deployer,
            uniswap.tokens[2].address,
            uniswap.tokens[3].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        await addLiquidity(
            deployer,
            uniswap.tokens[3].address,
            uniswap.tokens[4].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        await addLiquidity(
            deployer,
            uniswap.weth9.address,
            uniswap.tokens[4].address,
            expandTo18Decimals(1_000),
            expandTo18Decimals(1_000),
            uniswap
        )

        await feedProvider(deployer, accountFixture, uniswap, compound)
        await feedCompound(deployer, uniswap, compound)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)
        await enterMarkets(bob, accountBob.address, compound)
        await enterMarkets(achi, accountAchi.address, compound)
        await enterMarkets(gabi, accountGabi.address, compound)
        await enterMarkets(carol, accountCarol.address, compound)

        let mmC = await getMoneyMarketContract(accountAlice.address)
        await (mmC.connect(alice)).approveUnderlyings(uniswap.tokens.map(t => t.address))

        mmC = await getMoneyMarketContract(accountBob.address)
        await (mmC.connect(bob)).approveUnderlyings(uniswap.tokens.map(t => t.address))

        mmC = await getMoneyMarketContract(accountAchi.address)
        await (mmC.connect(achi)).approveUnderlyings(uniswap.tokens.map(t => t.address))

        mmC = await getMoneyMarketContract(accountGabi.address)
        await (mmC.connect(gabi)).approveUnderlyings(uniswap.tokens.map(t => t.address))

        mmC = await getMoneyMarketContract(accountCarol.address)
        await (mmC.connect(carol)).approveUnderlyings(uniswap.tokens.map(t => t.address))
        await accountFixture.dataProvider.setNativeWrapper(uniswap.weth9.address)
        await accountFixture.dataProvider.setRouter(uniswap.router.address)

        wethAddress = uniswap.weth9.address
        tokenAddresses = [...uniswap.tokens.map(tk => tk.address), wethAddress]
    })

    it('swap in exact in', async () => {
        const supplyIndex = 3
        const swapIndex = 0
        const routeIndexes = [0, 1, 2, 3]


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await uniswap.tokens[swapIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: swapAmount.mul(99).div(100)
        }

        const supplyPre = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAlice.address)

        await accountAlice.connect(alice).swapAndSupplyExactIn(params)

        const supplyPost = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAlice.address)


        expectToBeLess(supplyPost.sub(supplyPre), swapAmount)
        expectToBeLess(swapAmount, supplyPost.sub(supplyPre), 0.98)
    })

    it('swap ETH in exact in', async () => {
        const supplyIndex = 2
        const routeIndexes = [5, 4, 3, 2]

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(1)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: swapAmount.mul(99).div(100)
        }

        const supplyPre = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAlice.address)

        await accountAlice.connect(alice).swapETHAndSupplyExactIn(params, { value: params.amountIn })

        const supplyPost = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAlice.address)


        expectToBeLess(supplyPost.sub(supplyPre), swapAmount)
        expectToBeLess(swapAmount, supplyPost.sub(supplyPre), 0.98)
    })

    it('swap in exact out', async () => {
        const swapIndex = 0
        const supplyIndex = 3

        const routeIndexes = [0, 1, 2, 3]


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await uniswap.tokens[swapIndex].connect(bob).approve(accountBob.address, constants.MaxUint256)

        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(101).div(100),
            recipient: bob.address
        }

        const supplyPre = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountBob.address)

        await accountBob.connect(bob).swapAndSupplyExactOut(params)

        const supplyPost = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountBob.address)

        expect(supplyPost.sub(supplyPre).toString()).to.equal(swapAmount.toString())

    })

    it('swap ETH in exact out', async () => {
        const supplyIndex = 2

        const routeIndexes = [5, 4, 3, 2]


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(1).div(20)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])

        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(110).div(100),
        }

        const supplyPre = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountBob.address)

        await accountBob.connect(bob).swapETHAndSupplyExactOut(params, { value: params.amountInMaximum })

        const supplyPost = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountBob.address)

        expect(supplyPost.sub(supplyPre).toString()).to.equal(swapAmount.toString())

    })


    it('withdraw and swap exact in', async () => {
        const supplyAmount = expandTo18Decimals(100)
        const outputIndex = 0
        const supplyIndex = 3

        const routeIndexes = [0, 1, 2, 3]


        await supplyToCompound(achi, accountAchi.address, supplyIndex, supplyAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const supplyPre = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAchi.address)
        const balancePre = await uniswap.tokens[outputIndex].balanceOf(achi.address)

        const params = {
            path,
            userAmountProvided: 0,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256,
            recipient: achi.address
        }

        await accountAchi.connect(achi).withdrawAndSwapExactIn(params)

        const balancePost = await uniswap.tokens[outputIndex].balanceOf(achi.address)
        const supplyPost = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAchi.address)
        expect(supplyPre.sub(supplyPost).toString()).to.equal(swapAmount.toString())
        expectToBeLess(swapAmount, balancePost.sub(balancePre), 0.99)
        expectToBeLess(balancePost.sub(balancePre), swapAmount)
    })

    it('withdraw and swap exact in to ETH', async () => {
        const supplyAmount = expandTo18Decimals(100)
        const supplyIndex = 2

        const routeIndexes = [5, 4, 3, 2]


        await supplyToCompound(achi, accountAchi.address, supplyIndex, supplyAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(1)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const supplyPre = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAchi.address)
        const balancePre = await provider.getBalance(achi.address);

        const params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: swapAmount.mul(90).div(100),
            recipient: achi.address
        }

        await accountAchi.connect(achi).withdrawAndSwapExactInToETH(params)

        const balancePost = await provider.getBalance(achi.address);
        const supplyPost = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAchi.address)
        expect(supplyPre.sub(supplyPost).toString()).to.equal(swapAmount.toString())
        expectToBeLess(swapAmount, balancePost.sub(balancePre), 0.9)
        expectToBeLess(balancePost.sub(balancePre), swapAmount)
    })

    it('withdraw and swap exact out', async () => {
        const supplyAmount = expandTo18Decimals(110)
        const outputIndex = 0
        const supplyIndex = 3

        const routeIndexes = [0, 1, 2, 3]


        await supplyToCompound(achi, accountAchi.address, supplyIndex, supplyAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const supplyPre = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAchi.address)
        const balancePre = await uniswap.tokens[outputIndex].balanceOf(achi.address)

        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(101).div(100),
            recipient: achi.address
        }

        await accountAchi.connect(achi).withdrawAndSwapExactOut(params)

        const supplyPost = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAchi.address)
        const balancePost = await uniswap.tokens[outputIndex].balanceOf(achi.address)

        expect(balancePost.sub(balancePre).toString()).to.equal(swapAmount.toString())
        expectToBeLess(supplyAmount.sub(swapAmount), supplyPost, 0.9)
        expectToBeLess(supplyPre.sub(supplyPost), swapAmount, 0.9)
    })

    it('withdraw and swap exact out to ETH', async () => {
        const supplyAmount = expandTo18Decimals(110)
        const supplyIndex = 2

        const routeIndexes = [5, 4, 3, 2]


        await supplyToCompound(achi, accountAchi.address, supplyIndex, supplyAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(1).div(20)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const supplyPre = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAchi.address)
        const balancePre = await provider.getBalance(achi.address);

        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(101).div(100),
            recipient: achi.address
        }

        const tx = await accountAchi.connect(achi).withdrawAndSwapExactOutToETH(params)
        const receipt = await tx.wait();
        // here we receive ETH, but the transaction costs some, too - so we have to record and subtract that
        const gasUsed = (receipt.cumulativeGasUsed).mul(receipt.effectiveGasPrice);
        const supplyPost = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAchi.address)
        const balancePost = await provider.getBalance(achi.address);

        expect(balancePost.sub(balancePre).toString()).to.equal(swapAmount.sub(gasUsed).toString())
        expectToBeLess(supplyAmount.sub(swapAmount), supplyPost, 0.8)
        expectToBeLess(supplyPre.sub(supplyPost), swapAmount, 0.8)
    })


    it('borrow and swap exact in', async () => {
        const supplyAmount = expandTo18Decimals(500)
        const outputIndex = 3
        const supplyIndex = 2
        const borrowIndex = 0

        const routeIndexes = [0, 1, 2, 3]


        await supplyToCompound(achi, accountAchi.address, supplyIndex, supplyAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const balancePre = await uniswap.tokens[outputIndex].balanceOf(achi.address)
        const borrowBalancePre = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountAchi.address)

        const params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: swapAmount.mul(99).div(100),
            recipient: achi.address
        }

        await accountAchi.connect(achi).borrowAndSwapExactIn(params)

        const balancePost = await uniswap.tokens[outputIndex].balanceOf(achi.address)
        const borrowBalancePost = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountAchi.address)

        expect(borrowBalancePost.sub(borrowBalancePre).toString()).to.equal(swapAmount.toString())
        expectToBeLess(swapAmount, balancePost.sub(balancePre), 0.99)
        expectToBeLess(balancePost.sub(balancePre), swapAmount)
    })

    it('borrow and swap exact in to ETH', async () => {
        const supplyAmount = expandTo18Decimals(500)
        const supplyIndex = 2
        const borrowIndex = 3

        const routeIndexes = [3, 4, 5]


        await supplyToCompound(achi, accountAchi.address, supplyIndex, supplyAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(1)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const balancePre = await provider.getBalance(achi.address);
        const borrowBalancePre = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountAchi.address)

        const params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: swapAmount.mul(90).div(100),
            recipient: achi.address
        }

        const tx = await accountAchi.connect(achi).borrowAndSwapExactInToETH(params)
        const receipt = await tx.wait();
        // here we receive ETH, but the transaction costs some, too - so we have to record and subtract that
        const gasUsed = (receipt.cumulativeGasUsed).mul(receipt.effectiveGasPrice);
        const balancePost = await provider.getBalance(achi.address);

        const borrowBalancePost = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountAchi.address)
        expect(borrowBalancePost.sub(borrowBalancePre).toString()).to.equal(swapAmount.toString())
        expectToBeLess(swapAmount, balancePost.sub(balancePre), 0.99)
        expectToBeLess(balancePost.sub(balancePre), swapAmount.sub(gasUsed))
    })

    it('borrow and swap exact out', async () => {
        const supplyAmount = expandTo18Decimals(500)
        const outputIndex = 3
        const supplyIndex = 2
        const borrowIndex = 0

        const routeIndexes = [0, 1, 2, 3]


        await supplyToCompound(gabi, accountGabi.address, supplyIndex, supplyAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const balancePre = await uniswap.tokens[outputIndex].balanceOf(gabi.address)
        const borrowBalancePre = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountGabi.address)

        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(101).div(100),
            recipient: gabi.address
        }

        await accountGabi.connect(gabi).borrowAndSwapExactOut(params)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const balancePost = await uniswap.tokens[outputIndex].balanceOf(gabi.address)
        const borrowBalancePost = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountGabi.address)

        expect(swapAmount.toString()).to.equal(balancePost.sub(balancePre).toString())
        expectToBeLess(swapAmount, borrowBalancePost.sub(borrowBalancePre))
        expectToBeLess(borrowBalancePost.sub(borrowBalancePre), swapAmount, 0.95)
    })

    it('borrow and swap exact out to ETH', async () => {
        const supplyAmount = expandTo18Decimals(500)
        const outputIndex = 5
        const supplyIndex = 4
        const borrowIndex = 2

        const routeIndexes = [2, 3, 4, 5]


        await supplyToCompound(gabi, accountGabi.address, supplyIndex, supplyAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(1).div(20)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const balancePre = await provider.getBalance(gabi.address);
        const borrowBalancePre = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountGabi.address)

        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(110).div(100),
            recipient: gabi.address
        }

        const tx = await accountGabi.connect(gabi).borrowAndSwapExactOutToETH(params)
        const receipt = await tx.wait();
        // here we receive ETH, but the transaction costs some, too - so we have to record and subtract that
        const gasUsed = (receipt.cumulativeGasUsed).mul(receipt.effectiveGasPrice);

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const balancePost = await provider.getBalance(gabi.address);
        const borrowBalancePost = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountGabi.address)

        expect(swapAmount.sub(gasUsed).toString()).to.equal(balancePost.sub(balancePre).toString())
        expectToBeLess(swapAmount, borrowBalancePost.sub(borrowBalancePre))
        expectToBeLess(borrowBalancePost.sub(borrowBalancePre), swapAmount, 0.95)
    })

    it('swap and repay exact in', async () => {
        const supplyAmount = expandTo18Decimals(500)
        const borrowAmount = expandTo18Decimals(200)
        const inputIndex = 0
        const supplyIndex = 2
        const borrowIndex = 3

        const routeIndexes = [0, 1, 2, 3]


        await supplyToCompound(carol, accountCarol.address, supplyIndex, supplyAmount, uniswap)
        await borrowFromCompound(carol, accountCarol.address, borrowIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const balancePre = await uniswap.tokens[inputIndex].balanceOf(carol.address)
        const borrowBalancePre = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountCarol.address)

        const params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: swapAmount.mul(95).div(100),
            recipient: carol.address
        }

        await uniswap.tokens[inputIndex].connect(carol).approve(accountCarol.address, constants.MaxUint256)
        await accountCarol.connect(carol).swapAndRepayExactIn(params)

        const balancePost = await uniswap.tokens[inputIndex].balanceOf(carol.address)
        const borrowBalancePost = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountCarol.address)

        expect(balancePre.sub(balancePost).toString()).to.equal(swapAmount.toString())
        expectToBeLess(swapAmount, borrowBalancePre.sub(borrowBalancePost), 0.98)
        expectToBeLess(borrowBalancePre.sub(borrowBalancePost), swapAmount)
    })

    it('swap ETH and repay exact in', async () => {
        const supplyAmount = expandTo18Decimals(500)
        const borrowAmount = expandTo18Decimals(200)
        const supplyIndex = 3
        const borrowIndex = 2

        const routeIndexes = [5, 4, 3, 2]


        await supplyToCompound(carol, accountCarol.address, supplyIndex, supplyAmount, uniswap)
        await borrowFromCompound(carol, accountCarol.address, borrowIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(1)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const balancePre = await provider.getBalance(carol.address);

        const borrowBalancePre = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountCarol.address)

        const params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: swapAmount.mul(99).div(100),
            recipient: carol.address
        }

        const tx = await accountCarol.connect(carol).swapETHAndRepayExactIn(params, { value: swapAmount })
        const receipt = await tx.wait();
        // here we receive ETH, but the transaction costs some, too - so we have to record and subtract that
        const gasUsed = (receipt.cumulativeGasUsed).mul(receipt.effectiveGasPrice);
        const balancePost = await provider.getBalance(carol.address);

        const borrowBalancePost = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountCarol.address)

        expect(balancePre.sub(balancePost).toString()).to.equal(swapAmount.add(gasUsed).toString())
        expectToBeLess(swapAmount, borrowBalancePre.sub(borrowBalancePost), 0.98)
        expectToBeLess(borrowBalancePre.sub(borrowBalancePost), swapAmount)
    })

    it('swap and repay exact out', async () => {
        const supplyAmount = expandTo18Decimals(500)
        const borrowAmount = expandTo18Decimals(200)
        const inputIndex = 0
        const supplyIndex = 2
        const borrowIndex = 3

        const routeIndexes = [0, 1, 2, 3]


        await supplyToCompound(carol, accountCarol.address, supplyIndex, supplyAmount, uniswap)
        await borrowFromCompound(carol, accountCarol.address, borrowIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const balancePre = await uniswap.tokens[inputIndex].balanceOf(carol.address)
        const borrowBalancePre = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountCarol.address)

        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(105).div(100),
            recipient: carol.address
        }

        await uniswap.tokens[borrowIndex].connect(carol).approve(accountCarol.address, constants.MaxUint256)
        await accountCarol.connect(carol).swapAndRepayExactOut(params)

        const balancePost = await uniswap.tokens[inputIndex].balanceOf(carol.address)
        const borrowBalancePost = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountCarol.address)

        expect(borrowBalancePre.sub(borrowBalancePost).toString()).to.equal(swapAmount.toString())
        expectToBeLess(swapAmount, balancePre.sub(balancePost))
        expectToBeLess(balancePost.sub(balancePre), swapAmount, 0.99)
    })

    it('swap ETH and repay exact out', async () => {
        const supplyAmount = expandTo18Decimals(500)
        const borrowAmount = expandTo18Decimals(200)
        const supplyIndex = 1
        const borrowIndex = 2

        const routeIndexes = [5, 4, 3, 2]


        await supplyToCompound(carol, accountCarol.address, supplyIndex, supplyAmount, uniswap)
        await borrowFromCompound(carol, accountCarol.address, borrowIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(1)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const balancePre = await provider.getBalance(carol.address);
        const borrowBalancePre = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountCarol.address)

        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(101).div(100),
            recipient: carol.address
        }

        await uniswap.tokens[borrowIndex].connect(carol).approve(accountCarol.address, constants.MaxUint256)
        const tx = await accountCarol.connect(carol).swapETHAndRepayExactOut(params, { value: params.amountInMaximum })
        const receipt = await tx.wait();
        // here we receive ETH, but the transaction costs some, too - so we have to record and subtract that
        const gasUsed = (receipt.cumulativeGasUsed).mul(receipt.effectiveGasPrice);
        const balancePost = await provider.getBalance(carol.address);

        const borrowBalancePost = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountCarol.address)

        expect(borrowBalancePre.sub(borrowBalancePost).toString()).to.equal(swapAmount.toString())
        expectToBeLess(swapAmount.sub(gasUsed), balancePre.sub(balancePost))
        expectToBeLess(balancePost.sub(balancePre), swapAmount.sub(gasUsed), 0.99)
    })



    it('withdraw and swap all in', async () => {
        const supplyAmount = expandTo18Decimals(100)
        const outputIndex = 0
        const supplyIndex = 3

        const routeIndexes = [0, 1, 2, 3]
        const accountAchiAlt = await createMoneyMarketAccount(achi, accountFixture, true)

        await supplyToCompound(achi, accountAchiAlt.address, supplyIndex, supplyAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const balancePre = await uniswap.tokens[outputIndex].balanceOf(achi.address)
        const supplyPre = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAchiAlt.address)

        const params = {
            path,
            amountOutMinimum: supplyPre.mul(99).div(100),
            recipient: achi.address
        }
        const absoluteAccount = await getAbsoluteMarginTraderAccount(achi, accountAchiAlt.address)
        await absoluteAccount.connect(achi).withdrawAndSwapAllIn(params)

        const balancePost = await uniswap.tokens[outputIndex].balanceOf(achi.address)
        const supplyPost = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAchiAlt.address)

        expect(supplyPost.toString()).to.equal('0')
        expectToBeLess(balancePost.sub(balancePre), supplyPre)
        expectToBeLess(supplyPre, balancePost.sub(balancePre), 0.99)
    })

    it('withdraw and swap all in to ETH', async () => {
        const supplyAmount = expandTo18Decimals(100)
        const supplyIndex = 2

        const routeIndexes = [5, 4, 3, 2]
        const accountAchiAlt = await createMoneyMarketAccount(achi, accountFixture, true)

        await supplyToCompound(achi, accountAchiAlt.address, supplyIndex, supplyAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const supplyPre = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAchiAlt.address)
        const balancePre = await provider.getBalance(achi.address);

        const params = {
            path,
            amountOutMinimum: supplyPre.mul(90).div(100),
            recipient: achi.address
        }

        const absoluteAccount = await getAbsoluteMarginTraderAccount(achi, accountAchiAlt.address)
        await absoluteAccount.connect(achi).withdrawAndSwapAllInToETH(params)

        const balancePost = await provider.getBalance(achi.address);
        const supplyPost = await compound.cTokens[supplyIndex].callStatic.balanceOfUnderlying(accountAchiAlt.address)

        expect(supplyPost.toString()).to.equal('0')
        expectToBeLess(supplyPre, balancePost.sub(balancePre), 0.9)
        expectToBeLess(balancePost.sub(balancePre), supplyPre)
    })

    it('swap and repay all out', async () => {
        const supplyAmount = expandTo18Decimals(500)
        const borrowAmount = expandTo18Decimals(200)
        const inputIndex = 0
        const supplyIndex = 0
        const borrowIndex = 3

        const routeIndexes = [0, 1, 2, 3]

        const accountCarolAlt = await createMoneyMarketAccount(carol, accountFixture, true)
        await supplyToCompound(carol, accountCarolAlt.address, supplyIndex, supplyAmount, uniswap)
        await borrowFromCompound(carol, accountCarolAlt.address, borrowIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const balancePre = await uniswap.tokens[inputIndex].balanceOf(carol.address)
        const borrowBalancePre = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountCarolAlt.address)
        const params = {
            path,
            amountInMaximum: borrowAmount.mul(110).div(100),
            recipient: carol.address
        }

        await uniswap.tokens[borrowIndex].connect(carol).approve(accountCarolAlt.address, constants.MaxUint256)

        const absoluteAccount = await getAbsoluteMarginTraderAccount(carol, accountCarolAlt.address)

        const supplyPre = await compound.cTokens[borrowIndex].callStatic.balanceOfUnderlying(accountCarolAlt.address)
        await absoluteAccount.connect(carol).swapAndRepayAllOut(params)

        const balancePost = await uniswap.tokens[inputIndex].balanceOf(carol.address)
        const borrowBalancePost = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountCarolAlt.address)

        expect(borrowBalancePost.toString()).to.equal('0')
        expectToBeLess(supplyPre, balancePre.sub(balancePost))
        expectToBeLess(balancePost.sub(balancePre), supplyPre, 0.99)
    })

    it('swap ETH and repay all out', async () => {
        const supplyAmount = expandTo18Decimals(50)
        const borrowAmount = expandTo18Decimals(20)
        const supplyIndex = 1
        const borrowIndex = 2

        const routeIndexes = [5, 4, 3, 2]


        const accountCarolAlt = await createMoneyMarketAccount(carol, accountFixture, true)
        await supplyToCompound(carol, accountCarolAlt.address, supplyIndex, supplyAmount, uniswap)
        await borrowFromCompound(carol, accountCarolAlt.address, borrowIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const projectedAmount = expandTo18Decimals(21)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const balancePre = await provider.getBalance(carol.address);
        const borrowBalancePre = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountCarolAlt.address)
        const supplyPre = await compound.cEther.callStatic.balanceOfUnderlying(accountCarolAlt.address)

        const params = {
            path,
            amountOut: 0,
            amountInMaximum: borrowAmount.mul(110).div(100),
            recipient: carol.address
        }
        // await uniswap.tokens[borrowIndex].connect(carol).approve(accountCarolAlt.address, constants.MaxUint256)
        const absoluteAccount = await getAbsoluteMarginTraderAccount(carol, accountCarolAlt.address)
        const tx = await absoluteAccount.connect(carol).swapETHAndRepayAllOut(params, { value: params.amountInMaximum })
        const receipt = await tx.wait();
        // here we receive ETH, but the transaction costs some, too - so we have to record and subtract that
        const gasUsed = (receipt.cumulativeGasUsed).mul(receipt.effectiveGasPrice);
        const balancePost = await provider.getBalance(carol.address);

        const borrowBalancePost = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountCarolAlt.address)

        expect(borrowBalancePost.toString()).to.equal('0')
        expectToBeLess(supplyPre.sub(gasUsed), balancePre.sub(balancePost))
        expectToBeLess(balancePost.sub(balancePre), supplyPre.sub(gasUsed), 0.99)
    })

    it('function gatekeeper', async () => {

        const routeIndexes = [0, 1, 2, 3]

        const revertMessage = 'Only the account owner can interact.'

        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        let params: any = {
            path,
            userAmountProvided: 0,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256
        }


        await expect(
            accountAlice.connect(bob).swapAndSupplyExactIn(params)
        ).to.be.revertedWith(revertMessage)

        params = {
            path,
            userAmountProvided: 0,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256
        }


        await expect(
            accountAlice.connect(bob).swapETHAndSupplyExactIn(params, { value: params.amountIn })
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: 0,
            amountOut: swapAmount,
            amountInMaximum: constants.MaxUint256,
            recipient: bob.address
        }


        await expect(
            accountBob.connect(alice).swapAndSupplyExactOut(params)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: 0,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(3000),
            recipient: bob.address
        }

        await expect(
            accountBob.connect(achi).swapETHAndSupplyExactOut(params, { value: params.amountInMaximum })
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: 0,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256,
            recipient: achi.address
        }

        await expect(
            accountAchi.connect(gabi).withdrawAndSwapExactIn(params)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: 0,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256,
            recipient: achi.address
        }

        await expect(
            accountAchi.connect(bob).withdrawAndSwapExactInToETH(params)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: 0,
            amountOut: swapAmount,
            amountInMaximum: constants.MaxUint256,
            recipient: achi.address
        }

        await expect(
            accountAchi.connect(alice).withdrawAndSwapExactOut(params)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: 0,
            amountOut: swapAmount,
            amountInMaximum: constants.MaxUint256,
            recipient: achi.address
        }

        await expect(
            accountAchi.connect(gabi).withdrawAndSwapExactOutToETH(params)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: 0,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256,
            recipient: achi.address
        }

        await expect(
            accountAchi.connect(gabi).borrowAndSwapExactIn(params)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: 0,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256,
            recipient: achi.address
        }

        await expect(
            accountAchi.connect(gabi).borrowAndSwapExactInToETH(params)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: 0,
            amountOut: swapAmount,
            amountInMaximum: constants.MaxUint256,
            recipient: gabi.address
        }

        await expect(
            accountGabi.connect(achi).borrowAndSwapExactOut(params)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: 0,
            amountOut: swapAmount,
            amountInMaximum: constants.MaxUint256,
            recipient: gabi.address
        }

        await expect(
            accountGabi.connect(achi).borrowAndSwapExactOutToETH(params)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: constants.MaxUint256,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256,
            recipient: carol.address
        }

        await expect(
            accountCarol.connect(alice).swapAndRepayExactIn(params)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: constants.MaxUint256,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256,
            recipient: carol.address
        }

        await expect(
            accountCarol.connect(alice).swapETHAndRepayExactIn(params, { value: swapAmount })
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: 0,
            amountOut: swapAmount,
            amountInMaximum: constants.MaxUint256,
            recipient: carol.address
        }

        await expect(
            accountCarol.connect(bob).swapAndRepayExactOut(params)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: 0,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(101).div(100),
            recipient: carol.address
        }

        await expect(
            accountCarol.connect(alice).swapETHAndRepayExactOut(params, { value: params.amountInMaximum })
        ).to.be.revertedWith(revertMessage)

        const carolAlt = await getAbsoluteMarginTraderAccount(carol, accountCarol.address)

        await expect(
            carolAlt.connect(alice).swapETHAndRepayAllOut(params, { value: params.amountInMaximum })
        ).to.be.revertedWith(revertMessage)

        await expect(
            carolAlt.connect(alice).swapAndRepayAllOut(params)
        ).to.be.revertedWith(revertMessage)

        const achiAlt = await getAbsoluteMarginTraderAccount(achi, accountAchi.address)

        params = {
            path,
            userAmountProvided: 0,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256,
            recipient: achi.address
        }
        await expect(
            achiAlt.connect(gabi).withdrawAndSwapAllIn(params)
        ).to.be.revertedWith(revertMessage)

        params = {
            path,
            userAmountProvided: 0,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256,
            recipient: achi.address
        }

        await expect(
            achiAlt.connect(bob).withdrawAndSwapAllInToETH(params)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            userAmountProvided: 0,
            amountOut: swapAmount,
            amountInMaximum: constants.MaxUint256,
            recipient: achi.address
        }

    })

})

// ·----------------------------------------------------------------------------------------------|---------------------------|-----------------|-----------------------------·
// |                                     Solc version: 0.8.23                                     ·  Optimizer enabled: true  ·  Runs: 1000000  ·  Block limit: 30000000 gas  │
// ························································|······································|·············|·············|·················|···············|··············
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  approveUnderlyings                  ·          -  ·          -  ·         485291  ·            5  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  borrow                              ·     344621  ·     427325  ·         389976  ·            6  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  borrowAndSwapExactIn                ·          -  ·          -  ·         638930  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  borrowAndSwapExactInToETH           ·          -  ·          -  ·         575128  ·            2  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  borrowAndSwapExactOut               ·          -  ·          -  ·         618938  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  borrowAndSwapExactOutToETH          ·          -  ·          -  ·         623676  ·            2  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  enterMarkets                        ·          -  ·          -  ·         325361  ·            5  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  mint                                ·     142116  ·     179147  ·         168643  ·           16  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  swapAndRepayExactIn                 ·          -  ·          -  ·         366551  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  swapAndRepayExactOut                ·          -  ·          -  ·         368084  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  swapAndSupplyExactIn                ·          -  ·          -  ·         480807  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  swapAndSupplyExactOut               ·          -  ·          -  ·         410219  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  swapETHAndRepayExactIn              ·          -  ·          -  ·         364930  ·            2  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  swapETHAndRepayExactOut             ·          -  ·          -  ·         369144  ·            2  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  swapETHAndSupplyExactIn             ·          -  ·          -  ·         447403  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  swapETHAndSupplyExactOut            ·          -  ·          -  ·         414832  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  withdrawAndSwapExactIn              ·          -  ·          -  ·         575579  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  withdrawAndSwapExactInToETH         ·          -  ·          -  ·         583234  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  withdrawAndSwapExactOut             ·          -  ·          -  ·         556269  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  withdrawAndSwapExactOutToETH        ·          -  ·          -  ·         549293  ·            2  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// ························································|······································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  swapAndRepayAllOut                  ·          -  ·          -  ·         367748  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  swapETHAndRepayAllOut               ·          -  ·          -  ·         372731  ·            2  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  withdrawAndSwapAllIn                ·          -  ·          -  ·         593294  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  withdrawAndSwapAllInToETH           ·          -  ·          -  ·         618962  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············