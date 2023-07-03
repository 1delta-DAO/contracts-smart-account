module.exports = [
    '0x1F98431c8aD98523631AE4a59f267346ea31F984', // factory
    "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6", // weth
  ];

  // npx hardhat verify --network goerli 0xAad93F101123A3c20E55b215b726c9be5B4Be96F --contract contracts/1delta/account-based/modules/goerli/MarginTraderModule.sol:MarginTraderModuleGoerli --constructor-args deploy/account-based/arguments/marginTraderArgs.js

  // npx hardhat verify --network goerli 0x247c9795279B7258E5EEf89Ae9cF531DbB4E3b95 --contract contracts/external-protocols/uniswapV3/periphery/MinimalSwapRouter.sol:MinimalSwapRouter --constructor-args deploy/account-based/arguments/goerli/marginTraderArgs.js

