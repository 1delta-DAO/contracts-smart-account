import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, constants } from 'ethers';
import { ethers } from 'hardhat'
import {
    MintableERC20,
    WETH9,
    IERC20__factory,
    MinimalSwapRouter__factory
} from '../../../types';
import { FeeAmount, TICK_SPACINGS } from '../../uniswap-v3/periphery/shared/constants';
import { encodePriceSqrt } from '../../uniswap-v3/periphery/shared/encodePriceSqrt';
import { expandTo18Decimals } from '../../uniswap-v3/periphery/shared/expandTo18Decimals';
import { getMaxTick, getMinTick } from '../../uniswap-v3/periphery/shared/ticks';
import { brokerFixture, BrokerFixture, initBroker } from '../shared/brokerFixture';
import { expect } from '../shared/expect'
import { initializeMakeSuite, InterestRateMode, AAVEFixture } from '../shared/aaveFixture';
import { ONE_18 } from '../shared/marginSwapFixtures';
import { addLiquidity, uniswapFixtureNoTokens, UniswapFixtureNoTokens, uniswapMinimalFixtureNoTokens, UniswapMinimalFixtureNoTokens } from '../shared/uniswapFixture';
import { formatEther } from 'ethers/lib/utils';
import { encodePath } from '../../uniswap-v3/periphery/shared/path';

// we prepare a setup for aave in hardhat
// this series of tests checks that the features used for the margin swap implementation
// are correctly set up and working
describe('AAVE Money Market operations', async () => {
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carol: SignerWithAddress;
    let gabi: SignerWithAddress;
    let achi: SignerWithAddress;
    let wally: SignerWithAddress;
    let dennis: SignerWithAddress;
    let vlad: SignerWithAddress;
    let xander: SignerWithAddress;
    let uniswap: UniswapMinimalFixtureNoTokens;
    let aaveTest: AAVEFixture;
    let broker: BrokerFixture;
    let tokens: (MintableERC20 | WETH9)[];

    before('Deploy Account, Trader, Uniswap and AAVE', async () => {
        [deployer, alice, bob, carol, gabi, achi, wally, dennis, vlad, xander] = await ethers.getSigners();



        aaveTest = await initializeMakeSuite(deployer, 1)
        tokens = Object.values(aaveTest.tokens)
        uniswap = await uniswapMinimalFixtureNoTokens(deployer, aaveTest.tokens["WETH"].address)

        broker = await brokerFixture(deployer)

        await initBroker(deployer, broker, uniswap, aaveTest)

        await broker.manager.setUniswapRouter(uniswap.router.address)
        // approve & fund wallets
        let keys = Object.keys(aaveTest.tokens)
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            await aaveTest.tokens[key].connect(deployer).approve(aaveTest.pool.address, constants.MaxUint256)
            if (key === "WETH") {
                await (aaveTest.tokens[key] as WETH9).deposit({ value: expandTo18Decimals(5_000) })
                await aaveTest.pool.connect(deployer).supply(aaveTest.tokens[key].address, expandTo18Decimals(2_000), deployer.address, 0)

            } else {
                await (aaveTest.tokens[key] as MintableERC20)['mint(address,uint256)'](deployer.address, expandTo18Decimals(1_000_000_000))
                await aaveTest.pool.connect(deployer).supply(aaveTest.tokens[key].address, expandTo18Decimals(10_000), deployer.address, 0)

            }

            const token = aaveTest.tokens[key]
            await token.connect(deployer).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(bob).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(carol).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(alice).approve(uniswap.router.address, constants.MaxUint256)
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
            await broker.manager.addAToken(token.address, aaveTest.aTokens[key].address)
            await broker.manager.addSToken(token.address, aaveTest.sTokens[key].address)
            await broker.manager.addVToken(token.address, aaveTest.vTokens[key].address)
            await broker.manager.approveRouter([token.address])

        }


        await broker.manager.connect(deployer).approveAAVEPool(tokens.map(t => t.address))

        console.log("add liquidity DAI USDC")
        await addLiquidity(
            deployer,
            aaveTest.tokens["DAI"].address,
            aaveTest.tokens["USDC"].address,
            expandTo18Decimals(100_000),
            BigNumber.from(100_000e6), // usdc has 6 decmals
            uniswap
        )
        console.log("add liquidity DAI AAVE")
        await addLiquidity(
            deployer,
            aaveTest.tokens["DAI"].address,
            aaveTest.tokens["AAVE"].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        console.log("add liquidity AAVE WETH")
        await addLiquidity(
            deployer,
            aaveTest.tokens["AAVE"].address,
            aaveTest.tokens["WETH"].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(200),
            uniswap
        )

        console.log("add liquidity AAVE WMATIC")
        await addLiquidity(
            deployer,
            aaveTest.tokens["AAVE"].address,
            aaveTest.tokens["WMATIC"].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        console.log("add liquidity AAVE TEST1")
        await addLiquidity(
            deployer,
            aaveTest.tokens["AAVE"].address,
            aaveTest.tokens["TEST1"].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )


        console.log("add liquidity TEST1 TEST2")
        await addLiquidity(
            deployer,
            aaveTest.tokens["TEST1"].address,
            aaveTest.tokens["TEST2"].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        console.log("add liquidity TEST2 DAI")
        await addLiquidity(
            deployer,
            aaveTest.tokens["DAI"].address,
            aaveTest.tokens["TEST2"].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        console.log("add liquidity WMATIC DAI")
        await addLiquidity(
            deployer,
            aaveTest.tokens["DAI"].address,
            aaveTest.tokens["WMATIC"].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )


        console.log("add liquidity WETH MATIC")
        await addLiquidity(
            deployer,
            aaveTest.tokens["WETH"].address,
            aaveTest.tokens["WMATIC"].address,
            expandTo18Decimals(200),
            expandTo18Decimals(1_000_000),
            uniswap
        )
    })

    it('allows swap in supply exact in', async () => {


        const originIndex = "WMATIC"
        const targetIndex = "DAI"
        const providedAmount = expandTo18Decimals(160)

        const swapAmount = expandTo18Decimals(70)

        // transfer to wallet
        await aaveTest.tokens[originIndex].connect(deployer).transfer(carol.address, providedAmount)

        console.log("approve")
        await aaveTest.tokens[originIndex].connect(carol).approve(aaveTest.pool.address, constants.MaxUint256)
        await aaveTest.tokens[originIndex].connect(carol).approve(broker.broker.address, constants.MaxUint256)

        let _tokensInRoute = [
            aaveTest.tokens[originIndex],
            aaveTest.tokens["AAVE"],
            aaveTest.tokens["TEST1"],
            aaveTest.tokens["TEST2"],
            aaveTest.tokens[targetIndex]
        ].map(t => t.address)
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            fee: FeeAmount.MEDIUM,
            userAmountProvided: 0,
            interestRateMode: InterestRateMode.VARIABLE,
            amountIn: swapAmount,
            sqrtPriceLimitX96: '0',
            amountOutMinimum: '0'
        }


        console.log("swap in")
        const balBefore = await aaveTest.tokens[originIndex].balanceOf(carol.address)

        await broker.moneyMarket.connect(carol).swapAndSupplyExactIn(params)
        const balAfter = await aaveTest.tokens[originIndex].balanceOf(carol.address)
        const aTokenBal = await aaveTest.aTokens[targetIndex].balanceOf(carol.address)

        expect(swapAmount.toString()).to.equal(balBefore.sub(balAfter).toString())

        expect(Number(formatEther(aTokenBal))).to.greaterThanOrEqual(Number(formatEther(swapAmount)) * 0.98)
        expect(Number(formatEther(aTokenBal))).to.lessThanOrEqual(Number(formatEther(swapAmount)))
    })

    it('allows swap in supply exact out', async () => {


        const originIndex = "WMATIC"
        const targetIndex = "DAI"
        const providedAmount = expandTo18Decimals(160)

        const swapAmount = expandTo18Decimals(70)

        // transfer to wallet
        await aaveTest.tokens[originIndex].connect(deployer).transfer(gabi.address, providedAmount)

        console.log("approve")
        await aaveTest.tokens[originIndex].connect(gabi).approve(aaveTest.pool.address, constants.MaxUint256)
        await aaveTest.tokens[originIndex].connect(gabi).approve(broker.broker.address, constants.MaxUint256)

        let _tokensInRoute = [
            aaveTest.tokens[originIndex],
            aaveTest.tokens["AAVE"],
            aaveTest.tokens["TEST1"],
            aaveTest.tokens["TEST2"],
            aaveTest.tokens[targetIndex]
        ].map(t => t.address)
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            fee: FeeAmount.MEDIUM,
            userAmountProvided: 0,
            interestRateMode: InterestRateMode.VARIABLE,
            amountOut: swapAmount,
            recipient: gabi.address,
            sqrtPriceLimitX96: '0'
        }


        console.log("swap in")
        const balBefore = await aaveTest.tokens[originIndex].balanceOf(gabi.address)

        await broker.moneyMarket.connect(gabi).swapAndSupplyExactOut(constants.MaxUint256, params)
        const balAfter = await aaveTest.tokens[originIndex].balanceOf(gabi.address)
        const aTokenBal = await aaveTest.aTokens[targetIndex].balanceOf(gabi.address)

        expect(swapAmount.toString()).to.equal(aTokenBal.toString())

        expect(Number(formatEther(swapAmount))).to.greaterThanOrEqual(Number(formatEther(balBefore.sub(balAfter))) * 0.98)
        expect(Number(formatEther(swapAmount))).to.lessThanOrEqual(Number(formatEther(balBefore.sub(balAfter))))
    })

    it('allows withdraw and swap exact in', async () => {

        const originIndex = "WMATIC"
        const targetIndex = "DAI"
        const providedAmount = expandTo18Decimals(160)
        const supplied = expandTo18Decimals(100)
        const swapAmount = expandTo18Decimals(70)

        // transfer to wallet
        await aaveTest.tokens[originIndex].connect(deployer).transfer(achi.address, providedAmount)
        // supply
        await aaveTest.tokens[originIndex].connect(achi).approve(aaveTest.pool.address, constants.MaxUint256)
        await aaveTest.pool.connect(achi).supply(aaveTest.tokens[originIndex].address, supplied, achi.address, 0)

        console.log("approve")
        // await aaveTest.tokens[originIndex].connect(achi).approve(aaveTest.pool.address, constants.MaxUint256)
        // await aaveTest.tokens[originIndex].connect(achi).approve(broker.broker.address, constants.MaxUint256)
        await aaveTest.aTokens[originIndex].connect(achi).approve(broker.broker.address, constants.MaxUint256)

        let _tokensInRoute = [
            aaveTest.tokens[originIndex],
            aaveTest.tokens["AAVE"],
            aaveTest.tokens["TEST1"],
            aaveTest.tokens["TEST2"],
            aaveTest.tokens[targetIndex]
        ].map(t => t.address)
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            fee: FeeAmount.MEDIUM,
            userAmountProvided: 0,
            interestRateMode: InterestRateMode.VARIABLE,
            amountIn: swapAmount,
            recipient: achi.address,
            sqrtPriceLimitX96: '0'
        }



        const balBefore = await aaveTest.tokens[targetIndex].balanceOf(achi.address)
        console.log("withdraw and swap exact in")
        await broker.moneyMarket.connect(achi).withdrawAndSwapExactIn(params)

        const balAfter = await aaveTest.tokens[targetIndex].balanceOf(achi.address)
        const bb = await aaveTest.pool.getUserAccountData(achi.address)
        expect(bb.totalCollateralBase.toString()).to.equal(supplied.sub(swapAmount).toString())

        expect(Number(formatEther(swapAmount))).to.greaterThanOrEqual(Number(formatEther(balAfter.sub(balBefore))))
        expect(Number(formatEther(swapAmount))).to.lessThanOrEqual(Number(formatEther(balAfter.sub(balBefore))) * 1.03)
    })

    it('allows withdraw and swap exact out', async () => {

        const originIndex = "WMATIC"
        const targetIndex = "DAI"
        const providedAmount = expandTo18Decimals(160)
        const supplied = expandTo18Decimals(100)
        const swapAmount = expandTo18Decimals(70)

        // transfer to wallet
        await aaveTest.tokens[originIndex].connect(deployer).transfer(achi.address, providedAmount)
        // supply
        await aaveTest.tokens[originIndex].connect(achi).approve(aaveTest.pool.address, constants.MaxUint256)
        await aaveTest.pool.connect(achi).supply(aaveTest.tokens[originIndex].address, supplied, achi.address, 0)

        console.log("approve")
        await aaveTest.aTokens[originIndex].connect(achi).approve(broker.broker.address, constants.MaxUint256)

        let _tokensInRoute = [
            aaveTest.tokens[originIndex],
            aaveTest.tokens["AAVE"],
            aaveTest.tokens["TEST1"],
            aaveTest.tokens["TEST2"],
            aaveTest.tokens[targetIndex]
        ].map(t => t.address)
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            fee: FeeAmount.MEDIUM,
            userAmountProvided: 0,
            interestRateMode: InterestRateMode.VARIABLE,
            amountOut: swapAmount,
            recipient: achi.address,
            sqrtPriceLimitX96: '0'
        }

        const balBefore = await aaveTest.tokens[targetIndex].balanceOf(achi.address)
        const bbBefore = await aaveTest.pool.getUserAccountData(achi.address)
        console.log("withdraw and swap exact out")
        await broker.moneyMarket.connect(achi).withdrawAndSwapExactOut(params)

        const balAfter = await aaveTest.tokens[targetIndex].balanceOf(achi.address)
        const bb = await aaveTest.pool.getUserAccountData(achi.address)

        expect(Number(formatEther(bb.totalCollateralBase))).to.greaterThanOrEqual(Number(formatEther(bbBefore.totalCollateralBase.sub(swapAmount))) * 0.98)
        expect(Number(formatEther(bb.totalCollateralBase))).to.lessThanOrEqual(Number(formatEther(bbBefore.totalCollateralBase.sub(swapAmount))))


        expect(swapAmount.toString()).to.equal(balAfter.sub(balBefore).toString())

    })

    it('allows borrow and swap exact in', async () => {

        const originIndex = "WMATIC"
        const supplyIndex = "AAVE"
        const targetIndex = "DAI"
        const providedAmount = expandTo18Decimals(160)
        const supplied = expandTo18Decimals(100)
        const swapAmount = expandTo18Decimals(70)

        // transfer to wallet
        await aaveTest.tokens[supplyIndex].connect(deployer).transfer(wally.address, providedAmount)
        // supply
        await aaveTest.tokens[supplyIndex].connect(wally).approve(aaveTest.pool.address, constants.MaxUint256)
        await aaveTest.pool.connect(wally).supply(aaveTest.tokens[supplyIndex].address, providedAmount, wally.address, 0)
        await aaveTest.pool.connect(wally).setUserUseReserveAsCollateral(aaveTest.tokens[supplyIndex].address, true)

        let _tokensInRoute = [
            aaveTest.tokens[originIndex],
            aaveTest.tokens["AAVE"],
            aaveTest.tokens["TEST1"],
            aaveTest.tokens["TEST2"],
            aaveTest.tokens[targetIndex]
        ].map(t => t.address)
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            userAmountProvided: 0,
            interestRateMode: InterestRateMode.VARIABLE,
            amountIn: swapAmount,
            recipient: wally.address,
            sqrtPriceLimitX96: '0'
        }

        const balBefore = await aaveTest.tokens[targetIndex].balanceOf(wally.address)

        console.log("approve delegation")
        await aaveTest.vTokens[originIndex].connect(wally).approveDelegation(broker.moneyMarket.address, constants.MaxUint256)

        console.log("withdraw and swap exact in")
        await broker.moneyMarket.connect(wally).borrowAndSwapExactIn(InterestRateMode.VARIABLE, params)

        const balAfter = await aaveTest.tokens[targetIndex].balanceOf(wally.address)
        const bb = await aaveTest.pool.getUserAccountData(wally.address)

        expect(bb.totalDebtBase.toString()).to.equal(swapAmount.toString())

        expect(Number(formatEther(swapAmount))).to.greaterThanOrEqual(Number(formatEther(balAfter.sub(balBefore))))
        expect(Number(formatEther(swapAmount)) * 0.98).to.lessThanOrEqual(Number(formatEther(balAfter.sub(balBefore))))
    })

    it('allows borrow and swap exact out', async () => {

        const originIndex = "WMATIC"
        const supplyIndex = "AAVE"
        const targetIndex = "DAI"
        const providedAmount = expandTo18Decimals(160)
        const supplied = expandTo18Decimals(100)
        const swapAmount = expandTo18Decimals(70)

        // transfer to wallet
        await aaveTest.tokens[supplyIndex].connect(deployer).transfer(alice.address, providedAmount)
        // supply
        await aaveTest.tokens[supplyIndex].connect(alice).approve(aaveTest.pool.address, constants.MaxUint256)
        await aaveTest.pool.connect(alice).supply(aaveTest.tokens[supplyIndex].address, providedAmount, alice.address, 0)
        await aaveTest.pool.connect(alice).setUserUseReserveAsCollateral(aaveTest.tokens[supplyIndex].address, true)

        let _tokensInRoute = [
            aaveTest.tokens[originIndex],
            aaveTest.tokens["AAVE"],
            aaveTest.tokens["TEST1"],
            aaveTest.tokens["TEST2"],
            aaveTest.tokens[targetIndex]
        ].map(t => t.address)
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            userAmountProvided: 0,
            interestRateMode: InterestRateMode.VARIABLE,
            amountOut: swapAmount,
            recipient: alice.address,
            sqrtPriceLimitX96: '0'
        }

        const balBefore = await aaveTest.tokens[targetIndex].balanceOf(alice.address)


        console.log("approve delegation")
        await aaveTest.vTokens[originIndex].connect(alice).approveDelegation(broker.moneyMarket.address, constants.MaxUint256)

        console.log("withdraw and swap exact in")
        await broker.moneyMarket.connect(alice).borrowAndSwapExactOut(params)

        const balAfter = await aaveTest.tokens[targetIndex].balanceOf(alice.address)
        const bb = await aaveTest.pool.getUserAccountData(alice.address)
        expect(swapAmount.toString()).to.equal(balAfter.sub(balBefore).toString())

        expect(Number(formatEther(bb.totalDebtBase))).to.greaterThanOrEqual(Number(formatEther(swapAmount)))
        expect(Number(formatEther(bb.totalDebtBase))).to.lessThanOrEqual(Number(formatEther(swapAmount)) * 1.03)
    })


    it('allows swap and repay exact in', async () => {

        const originIndex = "WMATIC"
        const supplyIndex = "AAVE"
        const borrowTokenIndex = "DAI"
        const targetIndex = borrowTokenIndex
        const providedAmount = expandTo18Decimals(160)


        const swapAmount = expandTo18Decimals(70)
        const borrowAmount = expandTo18Decimals(75)


        // transfer to wallet
        await aaveTest.tokens[supplyIndex].connect(deployer).transfer(dennis.address, providedAmount)
        await aaveTest.tokens[originIndex].connect(deployer).transfer(dennis.address, swapAmount)

        console.log("approve")
        await aaveTest.tokens[supplyIndex].connect(dennis).approve(aaveTest.pool.address, constants.MaxUint256)

        // open position
        await aaveTest.pool.connect(dennis).supply(aaveTest.tokens[supplyIndex].address, providedAmount, dennis.address, 0)
        await aaveTest.pool.connect(dennis).setUserUseReserveAsCollateral(aaveTest.tokens[supplyIndex].address, true)


        console.log("borrow")
        await aaveTest.pool.connect(dennis).borrow(
            aaveTest.tokens[borrowTokenIndex].address,
            borrowAmount,
            InterestRateMode.VARIABLE,
            0,
            dennis.address
        )

        let _tokensInRoute = [
            aaveTest.tokens[originIndex],
            aaveTest.tokens["AAVE"],
            aaveTest.tokens["TEST1"],
            aaveTest.tokens["TEST2"],
            aaveTest.tokens[targetIndex]
        ].map(t => t.address)
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            userAmountProvided: 0,
            // interestRateMode: InterestRateMode.VARIABLE,
            amountIn: swapAmount,
            recipient: dennis.address,
            sqrtPriceLimitX96: '0'
        }


        await aaveTest.tokens[originIndex].connect(dennis).approve(broker.moneyMarket.address, constants.MaxUint256)

        await aaveTest.aTokens[borrowTokenIndex].connect(dennis).approve(broker.broker.address, constants.MaxUint256)

        await aaveTest.vTokens[borrowTokenIndex].connect(dennis).approveDelegation(broker.broker.address, constants.MaxUint256)

        const balBefore = await aaveTest.tokens[originIndex].balanceOf(dennis.address)
        const bbBefore = await aaveTest.pool.getUserAccountData(dennis.address)

        console.log("swap and repay exact in")
        await broker.moneyMarket.connect(dennis).swapAndRepayExactIn(InterestRateMode.VARIABLE, params)

        const balAfter = await aaveTest.tokens[originIndex].balanceOf(dennis.address)
        const bb = await aaveTest.pool.getUserAccountData(dennis.address)

        expect(balBefore.sub(balAfter).toString()).to.equal(swapAmount.toString())
        expect(Number(formatEther(bbBefore.totalDebtBase.sub(bb.totalDebtBase)))).to
            .greaterThanOrEqual(Number(formatEther(swapAmount)) * 0.98)
        expect(Number(formatEther(bbBefore.totalDebtBase.sub(bb.totalDebtBase)))).to
            .lessThanOrEqual(Number(formatEther(swapAmount)))
    })

    it('allows swap and repay exact out', async () => {

        const originIndex = "WMATIC"
        const supplyIndex = "AAVE"
        const borrowTokenIndex = "DAI"
        const targetIndex = borrowTokenIndex
        const providedAmount = expandTo18Decimals(160)


        const swapAmount = expandTo18Decimals(70)
        const borrowAmount = expandTo18Decimals(75)


        // transfer to wallet
        await aaveTest.tokens[supplyIndex].connect(deployer).transfer(xander.address, providedAmount)
        await aaveTest.tokens[originIndex].connect(deployer).transfer(xander.address, swapAmount.mul(11).div(10))

        console.log("approve")
        await aaveTest.tokens[supplyIndex].connect(xander).approve(aaveTest.pool.address, constants.MaxUint256)

        // open position
        await aaveTest.pool.connect(xander).supply(aaveTest.tokens[supplyIndex].address, providedAmount, xander.address, 0)
        await aaveTest.pool.connect(xander).setUserUseReserveAsCollateral(aaveTest.tokens[supplyIndex].address, true)


        console.log("borrow")
        await aaveTest.pool.connect(xander).borrow(
            aaveTest.tokens[borrowTokenIndex].address,
            borrowAmount,
            InterestRateMode.VARIABLE,
            0,
            xander.address
        )

        let _tokensInRoute = [
            aaveTest.tokens[originIndex],
            aaveTest.tokens["AAVE"],
            aaveTest.tokens["TEST1"],
            aaveTest.tokens["TEST2"],
            aaveTest.tokens[targetIndex]
        ].map(t => t.address)
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            userAmountProvided: 0,
            interestRateMode: InterestRateMode.VARIABLE,
            amountOut: swapAmount,
            recipient: xander.address,
            sqrtPriceLimitX96: '0'
        }


        await aaveTest.tokens[originIndex].connect(xander).approve(broker.moneyMarket.address, constants.MaxUint256)

        await aaveTest.aTokens[borrowTokenIndex].connect(xander).approve(broker.broker.address, constants.MaxUint256)

        await aaveTest.vTokens[borrowTokenIndex].connect(xander).approveDelegation(broker.broker.address, constants.MaxUint256)

        const balBefore = await aaveTest.tokens[originIndex].balanceOf(xander.address)
        const vBalBefore = await aaveTest.vTokens[borrowTokenIndex].balanceOf(xander.address)
        const bbBefore = await aaveTest.pool.getUserAccountData(xander.address)

        console.log("swap and repay exact out")
        await broker.moneyMarket.connect(xander).swapAndRepayExactOut(params)

        const balAfter = await aaveTest.tokens[originIndex].balanceOf(xander.address)
        const vBalAfter = await aaveTest.vTokens[borrowTokenIndex].balanceOf(xander.address)
        const bb = await aaveTest.pool.getUserAccountData(xander.address)

        // sometimes the debt accrues interest and minimally deviates, that is for safety
        expect(Number(formatEther(vBalBefore.sub(vBalAfter)))).to
            .greaterThanOrEqual(Number(formatEther(swapAmount)) * 0.99999999)
        expect(Number(formatEther(vBalBefore.sub(vBalAfter)))).to
            .lessThanOrEqual(Number(formatEther(swapAmount)) * 1.00000001)

        expect(Number(formatEther(bbBefore.totalDebtBase.sub(bb.totalDebtBase)))).to
            .greaterThanOrEqual(Number(formatEther(swapAmount)) * 0.99999999)
        expect(Number(formatEther(bbBefore.totalDebtBase.sub(bb.totalDebtBase)))).to
            .lessThanOrEqual(Number(formatEther(swapAmount)) * 1.00000001)

        expect(Number(formatEther(balBefore.sub(balAfter)))).to
            .greaterThanOrEqual(Number(formatEther(swapAmount)))
        expect(Number(formatEther(balBefore.sub(balAfter)))).to
            .lessThanOrEqual(Number(formatEther(swapAmount)) * 1.02)


    })

})