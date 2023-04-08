// Raffle

/** What do we need?
 * 1) Enter the lottery (by paying some amount)
 * 2) pick a random winner (verifyably rnadom)
 * 3) winner to be selected every X minutes. -> completely automated.
 */
//  Chainlink Oracle ==> Randomness, Automated Execution(Chainlink Keepers???)

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Raffle__NotEnoughETHEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__UpKeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {

    /*Type declaration */
    enum RaffleState {OPEN,CALCULATING} //==> OPEN = 0, CLOSED =1, all uint256

    /**State Variables */
    // The Chainlink VRF Coordinator is a contract that is deployed to a blockchain
    // that will check the randomness of each random number returned from a random node.
    // It will be the contract that requests the random numbers.
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;

    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;

    address private s_recentWinner;
    uint256 private s_lastTimeStamp = block.timestamp;
    RaffleState private s_raffleState;
    uint256 private immutable i_interval;

    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private immutable i_callbackGasLimit;
    uint32 private constant NUM_WORDS = 3;

    /**Events */
    event raffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 requestId);
    event WinnerPicked(address indexed player);

    constructor(
        address vrfCoordinatorV2,//contract
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_raffleState = RaffleState(0);
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    /**
     * CHAINLINK VRF ==> used to generate random numbers.
     * Requires to create a subscription on chainlink. Chainlink provides the wallet with LINKs
     * which can be spent for each time we ask a random number from the oracle.
     *
     * Once we ceate the contract that requires the random numbers, deploy it on the blockchain, we need to add it on
     * the contract list of the subscription on chainlink. This allows the SC to access the oracle.
     */

    /** Requesting the Random Number ::
     *  This is usually a two function process
     *   If there is only one function, the user can simulate the process by calling this function again and again.
     *   Instead we make the request in one function and fulfill it in the second. ==> the secind function is predefined in the contract.
     */

    function performUpkeep(bytes calldata /* performData */) external override {
        (bool upkeepNeeded,) = checkUpkeep("");
        if(!upkeepNeeded){
            revert Raffle__UpKeepNotNeeded(address(this).balance, s_players.length, uint256(s_raffleState));
        }
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, //keyHash = gasLane = max price for a request.
            i_subscriptionId, //sub id of the chainlink subscription
            REQUEST_CONFIRMATIONS, //Number of block confirmations to wait == 3
            i_callbackGasLimit, //
            NUM_WORDS //number of random numbers required
        );
        emit RequestedRaffleWinner(requestId);
    }

    // This particular function is inherited from the VRFContract.
    // It is  automatically called by the VRFContract and gives the random numbers  requested in the other function.
    function fulfillRandomWords(
        uint256 /*requestId*/,
        uint256[] memory randomWords
    ) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        s_lastTimeStamp = block.timestamp;
        s_raffleState = RaffleState.OPEN;
        s_players = new address payable[](0);
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) revert Raffle__TransferFailed();
        emit WinnerPicked(recentWinner);
    }

    /**
     * CHAINLINK KEEPERS ::
     *  These are tasks that are triggered when a certain condition is met.
     *  They are run on individual nodes and can be used to automte functions and smart contracts.
     *  This can be done by importing the keeper contract, importing two  functions from it namely,
     *  1) checkUpkeep,  
     *  2) performUpkeep.
     */

    function checkUpkeep(
        bytes memory /*checkData*/
    )
        public //changed from external to public to allow calling from within the SC
        override
        view
        returns (bool upkeepNeeded, bytes memory /*performData */)
    {
        /**
         * For check upkeep to return true ==> 
         * 1) Time Interval must have passed
         * 2) The lottery should have atleast one player and some ETH.
         * 3) Our subscription must have LINK
         * 4) The lottery must be "OPEN" ==> we sould  not be performing any other task ==> like requesting random number.
         */
        bool isOpen = (s_raffleState == RaffleState.OPEN);
        bool timePassed = ((block.timestamp-s_lastTimeStamp) > i_interval);
        bool hasPlayers = (s_players.length > 0);
        bool hasETH = (address(this).balance > 0);
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasETH);
        return (upkeepNeeded,"0x0");
    }

    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughETHEntered();
        }
        if(s_raffleState != RaffleState.OPEN){
            revert Raffle__NotOpen();
        }
        s_players.push(payable(msg.sender));
        emit raffleEnter(msg.sender);
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (uint256) {
        return uint256(s_raffleState);
    }

    // Since it does not read from memory
    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumPlayers() public view returns (uint256) {
        return (s_players.length);
    }

    function getLatestTimestamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }

    function getNumConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }
}
