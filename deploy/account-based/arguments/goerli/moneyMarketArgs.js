module.exports = [
  '0x1F98431c8aD98523631AE4a59f267346ea31F984', // factory
  "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6", // weth
  '0x2E5134f3Af641C8A9B8B0893023a19d47699ECD1' // minimal swap router
];

  // npx hardhat verify --network goerli 0x0B9bEe057F765E2d904791f5fD88737c66b4C32d --contract contracts/1delta/account-based/modules/goerli/MoneyMarketModule.sol:MoneyMarketModuleGoerli --constructor-args deploy/account-based/arguments/moneyMarketArgs.js

