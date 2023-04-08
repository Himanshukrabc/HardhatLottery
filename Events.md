EVM has a logging functionality.
It creates logs for every action that takes place on the Blockchain.
These logs can be seen using eth_getLogs command.


These logs are not accessible to smart contracts and 
are hence more gas efficient method to check wether a task has been performed or not.

The other way is to use variables in SCs which takes up gas.

Each event is tied to the smart contract tthat emitted it.
