# Margin Swap Contract Library
Contains contracts that allows users to create accounts from a factory. These accounts can then be used to interact with DEXes like UniswapV3 or lending protocols like Compound to create leveraged positions in a single click.

**It contains two implementations:**
1) Delegated Diamond Account Factory - Users can create account contracts that are used to interact with compound-type protocols. This is necessary as compound does not have a delegated borrowin function.
2) Diamond Broker - Users interact with a brokerage contract that builds margin positions using protocols like AAVE which implement delegated borrowing functions.
