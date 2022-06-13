import	React, {ReactElement, useContext, createContext}		from	'react';
import	{Contract}												from	'ethcall';
import	{useWeb3}												from	'@yearn-finance/web-lib/contexts';
import	{providers, performBatchedUpdates, format}				from	'@yearn-finance/web-lib/utils';
import	BUYBACK_ABI												from	'utils/abi/buyback.abi';
import	ERC20_ABI												from	'utils/abi/erc20.abi';
import 	{BigNumber, ethers}										from	'ethers';

type	TStatus = {
	price: BigNumber,
	maxAmount: BigNumber,
	rate: BigNumber,
	balanceOfDai: BigNumber,
	streamPerMonth: number,
	currentTime: number,
	loaded: boolean
}
type	TUserStatus = {
	balanceOfDai: BigNumber,
	balanceOfYfi: BigNumber,
	allowanceOfYfi: BigNumber,
	loaded: boolean
}
type	TBuyback = {
	status: TStatus
	userStatus: TUserStatus
	getUserStatus: () => Promise<void>
	getStatus: () => Promise<void>
}
const	defaultProps = {
	status: {
		price: ethers.constants.Zero,
		maxAmount: ethers.constants.Zero,
		rate: ethers.constants.Zero,
		balanceOfDai: ethers.constants.Zero,
		streamPerMonth: 0,
		currentTime: 0,
		loaded: false
	},
	userStatus: {
		balanceOfDai: ethers.constants.Zero,
		balanceOfYfi: ethers.constants.Zero,
		allowanceOfYfi: ethers.constants.Zero,
		loaded: false
	},
	getStatus: async (): Promise<void> => undefined,
	getUserStatus: async (): Promise<void> => undefined
};
const	BuybackContext = createContext<TBuyback>(defaultProps);
export const BuybackContextApp = ({children}: {children: ReactElement}): ReactElement => {
	const	{provider, isDisconnected, address} = useWeb3();
	const	[status, set_status] = React.useState<TStatus>(defaultProps.status);
	const	[userStatus, set_userStatus] = React.useState<TUserStatus>(defaultProps.userStatus);
	const	[, set_nonce] = React.useState(0);

	/* 🔵 - Yearn Finance ******************************************************
	**	On disconnect, reset status
	***************************************************************************/
	React.useEffect((): void => {
		if (isDisconnected) {
			set_status(defaultProps.status);
		}
	}, [isDisconnected]);

	/* 🔵 - Yearn Finance ******************************************************
	**	Fetch the element independant of user's wallet
	***************************************************************************/
	const getStatus = React.useCallback(async (): Promise<void> => {
		const	currentProvider = provider || providers.getProvider(1);
		const	ethcallProvider = await providers.newEthCallProvider(currentProvider);
		const	buyback = new Contract(process.env.BUYBACK_ADDR as string, BUYBACK_ABI);
		const	calls = [
			buyback.price(),
			buyback.max_amount(),
			buyback.rate(),
			buyback.total_dai()
		];
		const	results = await ethcallProvider.tryAll(calls) as [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber];
		const	[price, maxAmount, rate, balanceOfDai] = results;
		const	lastBlock = currentProvider.getBlock();

		const	streamPerMonth = format.toSafeValue(format.units(rate, 20));

		performBatchedUpdates((): void => {
			set_status({
				price,
				maxAmount,
				rate,
				streamPerMonth: streamPerMonth * 30 * 86400,
				balanceOfDai,
				currentTime: lastBlock.timestamp,
				loaded: true
			});
			set_nonce((n: number): number => n + 1);
		});
	}, [provider]);

	React.useEffect((): void => {
		getStatus();
	}, [getStatus]);

	/* 🔵 - Yearn Finance ******************************************************
	**	Fetch the element based on user's wallet
	***************************************************************************/
	const getUserStatus = React.useCallback(async (): Promise<void> => {
		if (!provider || !address || address === ethers.constants.AddressZero)
			return;
		const	ethcallProvider = await providers.newEthCallProvider(provider);
		const	yfiToken = new Contract(process.env.YFI_ADDR as string, ERC20_ABI);
		const	daiToken = new Contract(process.env.DAI_ADDR as string, ERC20_ABI);

		const	calls = [
			daiToken.balanceOf(address),
			yfiToken.balanceOf(address),
			yfiToken.allowance(address, process.env.BUYBACK_ADDR as string)
		];
		const	results = await ethcallProvider.tryAll(calls) as [BigNumber, BigNumber, BigNumber];
		performBatchedUpdates((): void => {
			const	[balanceOfDai, balanceOfYfi, allowanceOfYfi] = results;

			set_userStatus({balanceOfDai, balanceOfYfi, allowanceOfYfi, loaded: true});
			set_nonce((n: number): number => n + 1);
		});
	}, [address, provider]);
	React.useEffect((): void => {
		getUserStatus();
	}, [getUserStatus]);

	/* 🔵 - Yearn Finance ******************************************************
	**	Setup and render the Context provider to use in the app.
	***************************************************************************/
	return (
		<BuybackContext.Provider value={{userStatus, status, getUserStatus, getStatus}}>
			{children}
		</BuybackContext.Provider>
	);
};


export const useBuyback = (): TBuyback => useContext(BuybackContext);
export default useBuyback;
