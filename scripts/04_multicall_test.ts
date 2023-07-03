
import { ethers } from "hardhat";

const UniMulticallAbi = [{
    "inputs": [{
        "components": [{ "internalType": "address", "name": "target", "type": "address" }, { "internalType": "bytes", "name": "callData", "type": "bytes" }],
        "internalType": "struct Multicall2.Call[]", "name": "calls", "type": "tuple[]"
    }], "name": "aggregate", "outputs": [{ "internalType": "uint256", "name": "blockNumber", "type": "uint256" },
    { "internalType": "bytes[]", "name": "returnData", "type": "bytes[]" }], "stateMutability": "nonpayable", "type": "function"
}
]

export enum SupportedAssets {
    WETH = 'WETH',
    DAI = 'DAI',
    LINK = 'LINK',
    USDC = 'USDC',
    WBTC = 'WBTC',
    USDT = 'USDT',
    AAVE = 'AAVE',
    EURS = 'EURS',
    WMATIC = 'WMATIC',
    AGEUR = 'AGEUR',
    BAL = 'BAL',
    CRV = 'CRV',
    DPI = 'DPI',
    GHST = 'GHST',
    JEUR = 'JEUR',
    SUSHI = 'SUSHI',
}

const addressesAaveTokensGoerli: { [key: string]: { [chainId: number]: string } } = {
    [SupportedAssets.WETH]: { 5: '0x2e3A2fb8473316A02b8A297B982498E661E1f6f5' },
    [SupportedAssets.DAI]: { 5: '0xDF1742fE5b0bFc12331D8EAec6b478DfDbD31464' },
    [SupportedAssets.LINK]: { 5: '0x07C725d58437504CA5f814AE406e70E21C5e8e9e' },
    [SupportedAssets.USDC]: { 5: '0xA2025B15a1757311bfD68cb14eaeFCc237AF5b43' },
    [SupportedAssets.WBTC]: { 5: '0x8869DFd060c682675c2A8aE5B21F2cF738A0E3CE' },
    [SupportedAssets.USDT]: { 5: '0xC2C527C0CACF457746Bd31B2a698Fe89de2b6d49' },
    [SupportedAssets.AAVE]: { 5: '0x63242B9Bd3C22f18706d5c4E627B4735973f1f07' },
    [SupportedAssets.EURS]: { 5: '0xaA63E0C86b531E2eDFE9F91F6436dF20C301963D' },
}

const addressesAaveStableDebtTokensGoerli: { [key: string]: { [chainId: number]: string } } = {
    [SupportedAssets.WETH]: { 5: '0xCAF956bD3B3113Db89C0584Ef3B562153faB87D5' },
    [SupportedAssets.DAI]: { 5: '0xbaBd1C3912713d598CA2E6DE3303fC59b19d0B0F' },
    [SupportedAssets.LINK]: { 5: '0x4f094AB301C8787F0d06753CA3238bfA9CFB9c91' },
    [SupportedAssets.USDC]: { 5: '0xF04958AeA8b7F24Db19772f84d7c2aC801D9Cf8b' },
    [SupportedAssets.WBTC]: { 5: '0x15FF4188463c69FD18Ea39F68A0C9B730E23dE81' },
    [SupportedAssets.USDT]: { 5: '0x7720C270Fa5d8234f0DFfd2523C64FdeB333Fa50' },
    [SupportedAssets.AAVE]: { 5: '0x4a8aF512B73Fd896C8877cE0Ebed19b0a11B593C' },
    [SupportedAssets.EURS]: { 5: '0x512ad2D2fb3Bef82ca0A15d4dE6544246e2D32c7' },
}

const addressesAaveATokensGoerli: { [key: string]: { [chainId: number]: string } } = {
    [SupportedAssets.WETH]: { 5: '0x27B4692C93959048833f40702b22FE3578E77759' },
    [SupportedAssets.DAI]: { 5: '0x310839bE20Fc6a8A89f33A59C7D5fC651365068f' },
    [SupportedAssets.LINK]: { 5: '0x6A639d29454287B3cBB632Aa9f93bfB89E3fd18f' },
    [SupportedAssets.USDC]: { 5: '0x1Ee669290939f8a8864497Af3BC83728715265FF' },
    [SupportedAssets.WBTC]: { 5: '0xc0ac343EA11A8D05AAC3c5186850A659dD40B81B' },
    [SupportedAssets.USDT]: { 5: '0x73258E6fb96ecAc8a979826d503B45803a382d68' },
    [SupportedAssets.AAVE]: { 5: '0xC4bf7684e627ee069e9873B70dD0a8a1241bf72c' },
    [SupportedAssets.EURS]: { 5: '0xc31E63CB07209DFD2c7Edb3FB385331be2a17209' },
}

const addressesAaveVariableDebtTokens: { [key: string]: { [chainId: number]: string } } = {
    [SupportedAssets.WETH]: { 5: '0x2b848bA14583fA79519Ee71E7038D0d1061cd0F1' },
    [SupportedAssets.DAI]: { 5: '0xEa5A7CB3BDF6b2A8541bd50aFF270453F1505A72' },
    [SupportedAssets.LINK]: { 5: '0x593D1bB0b6052FB6c3423C42FA62275b3D95a943' },
    [SupportedAssets.USDC]: { 5: '0x3e491EB1A98cD42F9BBa388076Fd7a74B3470CA0' },
    [SupportedAssets.WBTC]: { 5: '0x480B8b39d1465b8049fbf03b8E0a072Ab7C9A422' },
    [SupportedAssets.USDT]: { 5: '0x45c3965f6FAbf2fB04e3FE019853813B2B7cC3A3' },
    [SupportedAssets.AAVE]: { 5: '0xad958444c255a71C659f7c30e18AFafdE910EB5a' },
    [SupportedAssets.EURS]: { 5: '0x257b4a23b3026E04790c39fD3Edd7101E5F31192' },
}

const multiAddress = '0x1F98415757620B543A52E61c46B32eB19261F984'
const test = [
    { gasLimit: 10_000_000, target: '0x04537F43f6adD7b1b60CAb199c7a910024eE0594', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x04537F43f6adD7b1b60CAb199c7a910024eE0594', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x0a6c4588b7D8Bd22cF120283B1FFf953420c45F3', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x0a6c4588b7D8Bd22cF120283B1FFf953420c45F3', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x0e44cEb592AcFC5D3F09D996302eB4C499ff8c10', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x0e44cEb592AcFC5D3F09D996302eB4C499ff8c10', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x0f663c16Dd7C65cF87eDB9229464cA77aEea536b', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x0f663c16Dd7C65cF87eDB9229464cA77aEea536b', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x167384319B41F7094e62f7506409Eb38079AbfF8', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x167384319B41F7094e62f7506409Eb38079AbfF8', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x24555B1E26407b8b56621da41F175c5E2B80f1b8', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x24555B1E26407b8b56621da41F175c5E2B80f1b8', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x250B28D1D75Ceb1732C16B6480017d8A9f6A6D2e', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x250B28D1D75Ceb1732C16B6480017d8A9f6A6D2e', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x254aa3A898071D6A2dA0DB11dA73b02B4646078F', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x254aa3A898071D6A2dA0DB11dA73b02B4646078F', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x257d365f7870742C87Bb3a8A53a609979908799A', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x257d365f7870742C87Bb3a8A53a609979908799A', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x33C4F0043E2e988b3c2e9C77e2C670eFe709Bfe3', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x33C4F0043E2e988b3c2e9C77e2C670eFe709Bfe3', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x3840D6A1B96292C8e44991B5605e03245584585b', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x3840D6A1B96292C8e44991B5605e03245584585b', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x3BFcb475E528F54246f1847EC0e7b53Dd88bda4e', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x3BFcb475E528F54246f1847EC0e7b53Dd88bda4e', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x3F5228d0e7D75467366be7De2c31D0d098bA2C23', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x3F5228d0e7D75467366be7De2c31D0d098bA2C23', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x3F82d2fe81904F0E74146A14904E5355ef476049', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x3F82d2fe81904F0E74146A14904E5355ef476049', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x42F0530351471dAB7ec968476D19bD36Af9Ec52d', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x42F0530351471dAB7ec968476D19bD36Af9Ec52d', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x45dDa9cb7c25131DF268515131f647d726f50608', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x45dDa9cb7c25131DF268515131f647d726f50608', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x4CcD010148379ea531D6C587CfDd60180196F9b1', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x4CcD010148379ea531D6C587CfDd60180196F9b1', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x5645dCB64c059aa11212707fbf4E7F984440a8Cf', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x5645dCB64c059aa11212707fbf4E7F984440a8Cf', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x58359563b3f4854428B1b98e91A42471e6d20B8e', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x58359563b3f4854428B1b98e91A42471e6d20B8e', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x5f69C2ec01c22843f8273838d570243fd1963014', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x5f69C2ec01c22843f8273838d570243fd1963014', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x67a9FE12fa6082D9D0203c84C6c56D3c4B269F28', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x67a9FE12fa6082D9D0203c84C6c56D3c4B269F28', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x67e708986a809aCefDe16f2417FA5701241E3935', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x67e708986a809aCefDe16f2417FA5701241E3935', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x6baD0f9a89Ca403bb91d253D385CeC1A2b6eca97', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x6baD0f9a89Ca403bb91d253D385CeC1A2b6eca97', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x7109C674e52b14FCFb8A04ffe254f454f9C61C18', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x7109C674e52b14FCFb8A04ffe254f454f9C61C18', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x781067Ef296E5C4A4203F81C593274824b7C185d', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x781067Ef296E5C4A4203F81C593274824b7C185d', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x7A7374873de28b06386013DA94CBd9b554f6AC6E', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x7A7374873de28b06386013DA94CBd9b554f6AC6E', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x86f1d8390222A3691C28938eC7404A1661E618e0', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x86f1d8390222A3691C28938eC7404A1661E618e0', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x88aAEed1fCFCA2Eda30749Afa9ad45A75c80E292', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x88aAEed1fCFCA2Eda30749Afa9ad45A75c80E292', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x88f3C15523544835fF6c738DDb30995339AD57d6', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x88f3C15523544835fF6c738DDb30995339AD57d6', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x9B08288C3Be4F62bbf8d1C20Ac9C5e6f9467d8B7', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x9B08288C3Be4F62bbf8d1C20Ac9C5e6f9467d8B7', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x9F2b55f290fb1dd0c80d685284dbeF91ebEEA480', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x9F2b55f290fb1dd0c80d685284dbeF91ebEEA480', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x9a4270d9DA562780A6bb5D01dcb527eb8eC86Da4', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x9a4270d9DA562780A6bb5D01dcb527eb8eC86Da4', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0x9a72FC3Fb9E99087d2eAE500355E7902C763f9B3', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0x9a72FC3Fb9E99087d2eAE500355E7902C763f9B3', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0xA374094527e1673A86dE625aa59517c5dE346d32', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0xA374094527e1673A86dE625aa59517c5dE346d32', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0xBB98B3D2b18aeF63a3178023A920971cf5F29bE4', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0xBB98B3D2b18aeF63a3178023A920971cf5F29bE4', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0xBD934A7778771A7E2D9bf80596002a214D8C9304', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0xBD934A7778771A7E2D9bf80596002a214D8C9304', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0xDaC8A8E6DBf8c690ec6815e0fF03491B2770255D', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0xDaC8A8E6DBf8c690ec6815e0fF03491B2770255D', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0xFE530931dA161232Ec76A7c3bEA7D36cF3811A0d', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0xFE530931dA161232Ec76A7c3bEA7D36cF3811A0d', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0xFd0693F146Eae257586E0dc63205f090e31a3584', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0xFd0693F146Eae257586E0dc63205f090e31a3584', callData: '0x3850c7bd' },
    { gasLimit: 10_000_000, target: '0xc21b964AF2B0254580d44981d624335f2b7C6fB6', callData: '0x1a686502' },
    { gasLimit: 10_000_000, target: '0xc21b964AF2B0254580d44981d624335f2b7C6fB6', callData: '0x3850c7bd' },
]

async function main() {
    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();
    console.log("Operate on", chainId, "by", operator.address)

    const simpleRpcProvider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com/') // mudit not always reliable


    const multiContract = await new ethers.Contract(multiAddress, UniMulticallAbi, simpleRpcProvider)

    const x = await multiContract.callStatic.aggregate([
        {
            gasLimit: 10_000_000,
            target: "0x1F98415757620B543A52E61c46B32eB19261F984",
            callData: "0x0f28c97d"
        }])

    console.log(x)

    const y = await multiContract.callStatic.aggregate(
        test
    )

    console.log(y)

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });