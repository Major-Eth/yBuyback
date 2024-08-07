import React, {ReactElement} from 'react';
import {GetServerSideProps} from 'next';
import {BigNumber, ethers} from 'ethers';
import {request} from 'graphql-request';
import {Parser} from 'json2csv';
import CountUp from 'react-countup';
import {LinkOut} from '@yearn-finance/web-lib/icons';
import {Card, Button, Input} from '@yearn-finance/web-lib/components';
import {List} from '@yearn-finance/web-lib/layouts';
import {format} from '@yearn-finance/web-lib/utils';
import {useWeb3} from '@yearn-finance/web-lib/contexts';
import LogoYearn from 'components/icons/LogoYearn';
import LogoDai from 'components/icons/LogoDai';
import BuybackChart from 'components/Chart';
import {TableHead, TableHeadCell} from 'components/TableHeadCell';
import type {TTableHead} from 'components/TableHeadCell';
import useBuyback from 'contexts/useBuyback';
import {getBuybacks} from 'pages/api/buyback-as-json';
import {Transaction, defaultTxStatus} from 'utils/tx';
import {approveERC20} from 'utils/actions/approveToken';
import {sell} from 'utils/actions/sell';
import {sortByKey, sum, toSafeDate} from 'utils';
import useSWR from 'swr';
import axios from 'axios';

type		TRowElement = {
	data: any,
	index: number,
	tokenPrice: number
}
type		TGraphDataElement = {
	datePeriod: string;
	yfiAmount: number;
	usdValue: number;
}
type		TGraphData = {
	[key: string]: TGraphDataElement
}

const fetcher = async (): Promise<{data: number}> => (
	axios.get('https://ydaemon.yearn.finance/1/prices/0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e?humanized=true')
);

function	RowElement({data, index, tokenPrice}: TRowElement): ReactElement {
	return (
		<div
			className={`grid grid-cols-22 py-4 px-6 w-[1200px] md:w-full ${index % 2 ? 'bg-neutral-0' : 'bg-neutral-200'}`}>
			<div className={'items-start min-w-32 row-3'}>
				<div className={'tabular-nums text-neutral-500'}>{format.date(toSafeDate(data.timestamp) as any)}</div>
			</div>
			<div className={'min-w-36 cell-end row-3'}>
				<div className={'cell-right'}>{format.amount(data.yfiAmount, 8, 8)}</div>
			</div>
			<div className={'min-w-36 cell-end row-4'}>
				<div className={'cell-right'}>
					<p>{`$ ${format.amount(data.usdValue, 2)}`}</p>
					<p className={'text-sm text-neutral-500'}>{`${format.amount(data.tokenAmount, 2)} ${data.token}`}</p>
				</div>
			</div>
			<div className={'min-w-36 cell-end row-4'}>
				<div className={'cell-right'}>{`$ ${format.amount(data.usdValue / data.yfiAmount, 2)}`}</div>
			</div>
			<div className={'min-w-36 cell-end row-4'}>
				<div className={'cell-right'}>
					{`$ ${format.amount(Number(tokenPrice) - (data.usdValue / data.yfiAmount))}`}
				</div>
			</div>
			<div className={'items-center min-w-32 row-4'}>
				<div className={'flex flex-row justify-end items-center w-full'}>
					<div>
						<a href={`https://etherscan.io/tx/${data.hash}`} target={'_blank'} rel={'noreferrer'}>
							<div className={'text-neutral-500 link'}>
								<LinkOut className={'w-4 h-4'} />
							</div>
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}

const		RowsWrapper = React.memo(function RowsWrapper({sortedData}: any): ReactElement {
	const	{data: prices} = useSWR('0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e', fetcher);

	return (
		<div className={'overflow-scroll w-[1200px] adapted-height scrollbar-none'}>
			<List.Animated>
				{sortedData?.map((row: any, index: number): ReactElement => (
					<div key={row.id}>
						<RowElement data={row} index={index} tokenPrice={prices?.data || 0} />
					</div>
				))}
			</List.Animated>
		</div>
	);
});

/* 🔵 - Yearn Finance **********************************************************
** This will render the head of the fake table we have, with the sortable
** elements. This component asks for sortBy and set_sortBy in order to handle
** the chevron displays and to set the sort based on the user's choice.
******************************************************************************/
function	RowHead({sortBy, set_sortBy}: TTableHead): ReactElement {
	return (
		<TableHead
			sortBy={sortBy}
			set_sortBy={set_sortBy}>
			<TableHeadCell
				className={'col-span-3 min-w-32 cell-start'}
				label={'Timestamp'}
				sortId={'time'} />
			<TableHeadCell
				className={'col-span-3 min-w-36 cell-end'}
				label={'YFI amount'}
				sortId={'yfi'} />
			<TableHeadCell
				className={'col-span-4 min-w-36 cell-end'}
				label={'USD value'}
				sortId={'value'} />
			<TableHeadCell
				className={'col-span-4 min-w-36 cell-end'}
				label={'Price per YFI'} />
			<TableHeadCell
				className={'col-span-4 min-w-36 cell-end'}
				label={'Price delta'} />
		</TableHead>
	);
}

function	RowFooter({data}: {data: TData[]}): ReactElement {
	function	prepareCSV(): void {
		const	fields = ['id', 'timestamp', 'yfiAmount', 'usdValue', 'tokenAmount', 'token', 'hash'];
		try {
			const	parser = new Parser({fields});
			const	csv = parser.parse(data);
			const	csvFile = new Blob([csv], {type: 'text/csv'});
			const	downloadLink = document.createElement('a');
			downloadLink.download = 'yfi-buyback.csv';
			downloadLink.href = window.URL.createObjectURL(csvFile);
			downloadLink.style.display = 'none';
			document.body.appendChild(downloadLink);
			downloadLink.click();
			document.body.removeChild(downloadLink);
		} catch (err) {
			console.error(err);
		}
		
	}

	function	computeAvegagePrice(): number {
		let	sumUSD = 0;
		let	sumYFI = 0;
		for (const element of data) {
			sumUSD += element.usdValue;
			sumYFI += element.yfiAmount;
		}
		return sumUSD / sumYFI;
	}

	return (
		<div className={'grid sticky bottom-0 z-10 grid-cols-22 items-center py-3 px-6 w-[1200px] md:w-full bg-neutral-0'}>
			<div className={'col-span-3 min-w-36'}>
				<div className={'font-bold tabular-nums text-neutral-700'}>{'Total:'}</div>
			</div>
			<div className={'justify-end items-start min-w-36 row-3'}>
				<div className={'font-bold tabular-nums text-right text-neutral-700'}>
					{`${format.amount(sum(data.map((e: TData): number => e.yfiAmount)), 12, 8)}`}
				</div>
			</div>
			<div className={'justify-end items-start min-w-36 row-4'}>
				<div className={'font-bold tabular-nums text-right text-neutral-700'}>
					{`$ ${format.amount(sum(data.map((e: TData): number => e.usdValue)), 2)}`}
				</div>
			</div>
			<div className={'justify-end items-start min-w-36 row-4'}>
				<div className={'font-bold tabular-nums text-right text-neutral-700'}>
					{`Avg. price: $ ${format.amount(computeAvegagePrice())}`}
				</div>
			</div>
			<div className={'col-span-4 min-w-36'}>
				<div className={''}>{''}</div>
			</div>
			<div className={'justify-end min-w-32 row-4'}>
				<Button onClick={prepareCSV} variant={'filled'}>
					<p className={'font-normal'}>{'Export CSV'}</p>
				</Button>
			</div>
		</div>
	);
}

function	Index({data}: {data: TData[]}): ReactElement | null {
	const	{isActive, provider} = useWeb3();
	const	{userStatus, status, getStatus, getUserStatus} = useBuyback();
	const	[sortBy, set_sortBy] = React.useState('time');
	const	[sortedData, set_sortedData] = React.useState([...data].reverse());
	const	[graphData, set_graphData] = React.useState<TGraphData>({});
	const	[totalInfo, set_totalInfo] = React.useState({yfiAmount: 0, usdValue: 0, loaded: false});
	const	[userBalanceOfDai, set_userBalanceOfDai] = React.useState(ethers.constants.Zero);
	const	[userBalanceOfYfi, set_userBalanceOfYfi] = React.useState(ethers.constants.Zero);
	const	[txStatusApprove, set_txStatusApprove] = React.useState(defaultTxStatus);
	const	[txStatusSell, set_txStatusSell] = React.useState(defaultTxStatus);
	const	[amount, set_amount] = React.useState('');
	const	[streamDelta, set_streamDelta] = React.useState(0);
	const	isGraphReady = !(!sortedData || sortedData.length === 0);

	React.useEffect((): void => {
		set_userBalanceOfDai(userStatus.balanceOfDai || '0');
		set_userBalanceOfYfi(userStatus.balanceOfYfi || '0');
	}, [userStatus]);

	React.useEffect((): void => {
		let _data = data.map((a: TData): TData => ({...a}));

		if (sortBy === 'time') {
			_data = sortByKey(_data, 'timestamp', -1);
		} else if (sortBy === 'yfi') {
			_data = sortByKey(_data, 'yfiAmount', -1);
		} else if (sortBy === 'value') {
			_data = sortByKey(_data, 'usdValue', -1);
		}
		set_sortedData(_data);
	}, [sortBy, data]);

	React.useEffect((): void => {
		const _data = data.map((a: any): TData => ({...a}));

		let		totalYfiAmount = 0;
		let		totalUSDValue = 0;
		const	arr: TGraphData = {};

		const	start = new Date(1604185201000);
		const	end = new Date();
		for (let date = start; date <= end; date.setMonth(date.getMonth() + 1)) {
			const	year = date.getFullYear();
			const	month = date.getMonth() + 1;
			const	monthStr = month < 10 ? `0${month}` : `${month}`;
			const	datePeriod = new Intl.DateTimeFormat('en-US', {month: 'short', year: 'numeric'}).format(date);
			const	key = `${year}-${monthStr}`;
			arr[key] = {
				datePeriod,
				yfiAmount: 0,
				usdValue: 0
			};
		}

		for (const element of _data) {
			const	row = element;
			const	safeDate = toSafeDate(row.timestamp);
			const	year = safeDate.getFullYear();
			let		month = String((safeDate.getMonth()) + 1);
			if (Number(month) < 10)
				month = `0${month}`;
			const	datePeriodKey = `${year}-${month}`;
			const	datePeriod = new Intl.DateTimeFormat('en-US', {month: 'short', year: 'numeric'}).format(safeDate);
			if (!arr[datePeriodKey]) {
				arr[datePeriodKey] = {
					datePeriod,
					yfiAmount: 0,
					usdValue: 0
				};
			}
			arr[datePeriodKey].yfiAmount += row.yfiAmount;
			totalYfiAmount += row.yfiAmount;
			arr[datePeriodKey].usdValue += row.usdValue;
			totalUSDValue += row.usdValue;
		}
		
		set_graphData(arr);
		set_totalInfo({yfiAmount: totalYfiAmount, usdValue: totalUSDValue, loaded: true});
	}, [data]);

	async function	onSell(): Promise<void> {
		if (txStatusSell.pending)
			return;
		await new Transaction(provider, sell, set_txStatusSell)
			.populate(
				format.toSafeAmount(amount, userBalanceOfYfi)
			).onSuccess(async (): Promise<void> => {
				await Promise.all([getStatus(), getUserStatus()]);
				set_amount('');
			}).perform();
	}

	async function	onApprove(): Promise<void> {
		if (txStatusApprove.pending)
			return;
		await new Transaction(provider, approveERC20, set_txStatusApprove)
			.populate(
				process.env.YFI_ADDR as string,
				process.env.BUYBACK_ADDR as string,
				format.toSafeAmount(amount, userBalanceOfYfi)
			).onSuccess(async (): Promise<void> => {
				await getUserStatus();
			}).perform();
	}

	function	maxValue(): BigNumber {
		//Determine if max amount in YFI is user's balance or contracts' Remaining to buy
		let	expectedMaxAmount = userBalanceOfYfi;
		if (status?.maxAmount && userBalanceOfYfi.gte(status.maxAmount))
			expectedMaxAmount = status.maxAmount;
		return (expectedMaxAmount);
	}

	React.useEffect((): (() => void) => {
		const	interval = setInterval(async (): Promise<void> => {
			const	_status = await getStatus();
			const	rate = format.toSafeValue(format.units(_status.rate, 20));
			const	currentTime = _status.currentTime;
			const	now = Math.floor(new Date().valueOf() / 1000);
			set_streamDelta((now - currentTime) * rate);
		}, 1000);
		return (): void => {
			clearInterval(interval);
		};
	}, [status, provider]);

	const formatDAI = React.useCallback((n: number): string => `${format.amount(n, 2, 2)} DAI`, []);
	const formatYFI = React.useCallback((n: number): string => `${format.amount(n, 5, 5)} YFI`, []);

	return (
		<div className={'grid grid-cols-12 gap-4'}>
			<Card className={'col-span-12 md:col-span-7'}>
				<h2 className={'text-xl font-bold text-neutral-700'}>{'Yearn wants your YFI'}</h2>
				<div className={'mt-4 mb-6 space-y-4 md:mb-10'}>
					<p className={'text-neutral-500'}>{'YFI is an important part of how we build Yearn. It’s one of the ways we pay for the best DeFi talent, ensuring that the incentives of those building the protocol align with the protocol itself. After all, skin in the game is the best way to play.'}</p>
					<p className={'text-neutral-500'}>
						{`We’ve bought ${!totalInfo.loaded ? '-' : format.amount(totalInfo.yfiAmount, 2, 5)} YFI to date, and we still want more. The buyback `}
						<a href={`https://etherscan.io/address/${process.env.BUYBACK_ADDR as string}`} target={'_blank'} rel={'noreferrer'} className={'underline'}>
							{'contract'}
						</a>
						{' is topped up from time to time with more DAI, so it’s worth revisiting this page in the future.'}
					</p>
					<p className={'text-neutral-500'}>
						{`We stream ${!totalInfo.loaded ? '-' : format.amount(status.streamPerMonth, 2, 2)} DAI per month to the piggybank to be used for buybacks.`}
					</p>
				</div>
				<div className={'grid grid-cols-2 gap-4 md:grid-cols-3'}>
					<div>
						<p className={'pb-1 md:pb-2 text-neutral-500'}>{'Our piggybank has'}</p>
						<b className={'font-mono text-lg tabular-nums md:text-xl'}>
							{!status.loaded ? '- DAI' : <CountUp
								preserveValue
								decimals={2}
								duration={2}
								formattingFn={formatDAI}
								end={format.toNormalizedValue(status.balanceOfDai) + streamDelta} />}
						</b>
						<p className={'pt-0.5 text-sm text-[#7F8DA9]'}>
							{status.loaded && status.rate && !status.rate.isZero() ? `+ ${format.amount(status.streamPerMonth, 2, 2)} DAI/month` : ''}
						</p>
					</div>
					<div>
						<p className={'pb-1 md:pb-2 text-neutral-500'}>{'We\'ll buy each YFI for'}</p>
						<b className={'font-mono text-lg tabular-nums md:text-xl'}>
							{!status.loaded ? '- DAI' : <CountUp
								preserveValue
								decimals={2}
								duration={2}
								formattingFn={formatDAI}
								end={format.toNormalizedValue(status.price)} />}
						</b>
					</div>
					<div>
						<p className={'pb-1 md:pb-2 text-neutral-500'}>{'You can sell us max'}</p>
						<b className={'font-mono text-lg md:text-xl'}>
							{!status.loaded ? '- YFI' : <CountUp 
								preserveValue
								decimals={5}
								duration={2}
								formattingFn={formatYFI}
								end={format.toNormalizedValue(status.maxAmount)} />}
						</b>
					</div>

				</div>
			</Card>
			<Card className={'col-span-12 md:col-span-5'}>
				<div>
					<p className={'text-neutral-500'}>{'You sell'}</p>
					<div className={'flex flex-row mt-2 space-x-2'}>
						<div className={'aspect-square flex flex-col justify-center items-center w-24 md:w-32 md:min-w-32 rounded-default min-w-24 bg-neutral-200'}>
							<LogoYearn className={'w-8 h-8 md:w-12 md:h-12'}/>
							<div className={'mt-2 md:mt-4'}>
								<b>{'YFI'}</b>
							</div>
						</div>
						<div className={'flex flex-col py-2 px-4 w-full h-24 md:py-4 md:px-6 md:h-32 rounded-default bg-neutral-200'}>
							<Input.BigNumber
								balance={format.toNormalizedAmount(userBalanceOfYfi)}
								price={format.toNormalizedValue(status.price)}
								value={amount}
								onSetValue={(s: string): void => set_amount(s)}
								maxValue={maxValue()}
								decimals={18} />
						</div>
					</div>
				</div>
				<div className={'my-4'}>
					<p className={'text-neutral-500'}>{'You receive'}</p>
					<div className={'flex flex-row mt-2 space-x-2'}>
						<div className={'aspect-square flex flex-col justify-center items-center w-24 border md:w-32 md:min-w-32 rounded-default min-w-24 bg-neutral-0 border-neutral-400'}>
							<LogoDai className={'w-8 h-8 md:w-12 md:h-12'}/>
							<div className={'mt-2 md:mt-4'}>
								<b>{'DAI'}</b>
							</div>
						</div>
						<div className={'flex flex-col py-2 px-4 w-full h-24 border md:py-4 md:px-6 md:h-32 rounded-default bg-neutral-0 border-neutral-400'}>
							<Input.BigNumber
								disabled
								balance={format.toNormalizedAmount(userBalanceOfDai)}
								price={1}
								value={(Number(amount || 0) * format.toNormalizedValue(status.price)).toFixed(2)}
								onSetValue={(): void => undefined}
								decimals={18}
								withMax={false} />
						</div>
					</div>
				</div>
				<div className={'grid grid-cols-2 gap-2'}>
					<Button
						variant={'filled'}
						className={'!h-10'}
						onClick={onApprove}
						isBusy={txStatusApprove.pending}
						isDisabled={
							!isActive
							|| amount === '' || Number(amount) === 0 
							|| Number(amount) > Number(format.units(userBalanceOfYfi || 0, 18))
							|| Number(amount) <= Number(format.units(userStatus.allowanceOfYfi || 0, 18))
						}>
						{txStatusApprove.error ? 'Transaction failed' : txStatusApprove.success ? 'Transaction successful' : 'Approve'}
					</Button>
					<Button
						variant={'filled'}
						className={'!h-10'}
						onClick={onSell}
						isBusy={txStatusSell.pending}
						isDisabled={
							!isActive
							|| amount === '' || Number(amount) === 0 
							|| Number(amount) > Number(format.units(userStatus.allowanceOfYfi || 0, 18))
						}>
						{txStatusSell.error ? 'Transaction failed' : txStatusSell.success ? 'Transaction successful' : 'Sell'}
					</Button>
				</div>

			</Card>
			{!isGraphReady ? null :
				<div className={'overflow-x-scroll col-span-12 justify-center items-center'}>
					<Card className={'hidden w-full h-136 md:block'}>
						<div className={'flex flex-row mb-6 space-x-11'}>
							<div className={'flex flex-col'}>
								<p className={'mb-2 text-neutral-500'}>{'Buyback over time'}</p>
								<p className={'text-xl font-bold text-neutral-700'}>
									{`${format.amount(totalInfo.yfiAmount, 5)} YFI`}
								</p>
							</div>
							<div className={'flex flex-col'}>
								<p className={'mb-2 text-neutral-500'}>{'In USD'}</p>
								<p className={'text-xl font-bold text-neutral-700'}>
									{`$ ${format.amount(totalInfo.usdValue, 2)}`}
								</p>
							</div>
						</div>
						{graphData ? <BuybackChart graphData={graphData} /> : null}
					</Card>
					<div className={'flex overflow-x-scroll relative flex-col grid-cols-22 w-[1200px] md:block md:h-auto scrollbar-none'}>
						<RowHead sortBy={sortBy} set_sortBy={set_sortBy} />
						<RowsWrapper sortedData={sortedData} />
						<RowFooter data={data} />
					</div>
				</div>
			}
		</div>
	);
}

type	TData = {
	id: number | string,
	timestamp: string,
	yfiAmount: number,
	usdValue: number,
	tokenAmount: number,
	token: string,
	hash: string,
}
export const getServerSideProps: GetServerSideProps = async (): Promise<any> => {
	const	formatTimestamp = (timestamp: number): string => {
		const	date = new Date(timestamp * 1000);
		const	year = date.getFullYear();
		const	month = date.getMonth() + 1;
		const	day = date.getDate();
		const	hours = date.getHours();
		const	minutes = date.getMinutes();
		const	seconds = date.getSeconds();
		return `${year}-${month < 10 ? `0${month}` : month}-${day < 10 ? `0${day}` : day} ${hours < 10 ? `0${hours}` : hours}:${minutes < 10 ? `0${minutes}` : minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
	};

	const	[{buyBacks}, _legacyData] = await Promise.all([
		request((process.env.SUBGRAPH_URI || ''), `{
			buyBacks(first: 1000) {
				id
				block
				timestamp
				seller
				yfi
				dai
			}
		}`),
		getBuybacks()
	]);

	const	dynamicData: TData[] = buyBacks.map((buyBack: any): TData => ({
		id: buyBack.id,
		timestamp: formatTimestamp(buyBack.timestamp),
		yfiAmount: format.toNormalizedValue(buyBack.yfi),
		usdValue: format.toNormalizedValue(buyBack.dai),
		tokenAmount: format.toNormalizedValue(buyBack.dai),
		token: 'DAI',
		hash: (buyBack.id as string).split('-')[1]
	}));
	const	legacyData: TData[] = _legacyData as unknown as TData[];

	return {props: {data: [
		...legacyData,
		...dynamicData
	]}};
};

export default Index;