import { App } from 'obsidian';
import { HPageModule } from '../types';

// ==================== 农历算法（内置，无需外部依赖） ====================

// 农历数据表 1900-2100，每个年用一个16进制数编码
// 格式: bits[0-3]=闰月月份(0=无闰月), bits[4]=闰月大小(0=29天/1=30天)
// bits[5-16]=1-12月大小(0=29天/1=30天), bit[17]=春节所在公历月的偏移标志
const LUNAR_INFO: number[] = [
	0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
	0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
	0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
	0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
	0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
	0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
	0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
	0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
	0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
	0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
	0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
	0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
	0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
	0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
	0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
	0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
	0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
	0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
	0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
	0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a4d0,0x0d150,0x0f252,
	0x0d520
];

// 天干
const TIANGAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
// 地支
const DIZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
// 生肖
const ZODIAC = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];
// 农历月名
const LUNAR_MONTH = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
// 农历日名
const LUNAR_DAY = [
	'初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
	'十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
	'廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'
];

// 农历重要节日/节气
const LUNAR_FESTIVALS: Record<string, string> = {
	'1-1': '🧨 春节', '1-15': '🏮 元宵节', '2-2': '🐉 龙抬头',
	'5-5': '🐉 端午节', '7-7': '💕 七夕', '7-15': '👻 中元节',
	'8-15': '🌙 中秋节', '9-9': '🏔️ 重阳节', '12-8': '🥣 腊八节',
	'12-23': '🧹 小年', '12-30': '🧨 除夕',
};

// 公历节日
const SOLAR_FESTIVALS: Record<string, string> = {
	'1-1': '🎉 元旦', '2-14': '💝 情人节', '3-8': '👩 妇女节',
	'3-12': '🌳 植树节', '4-1': '🤡 愚人节', '5-1': '👷 劳动节',
	'5-4': '🎵 青年节', '6-1': '🎈 儿童节', '7-1': '🇨🇳 建党节',
	'8-1': '🎖️ 建军节', '9-10': '📚 教师节', '10-1': '🇨🇳 国庆节',
	'10-31': '🎃 万圣节', '12-24': '🎄 平安夜', '12-25': '🎄 圣诞节',
};

// 计算农历年的总天数
function lunarYearDays(y: number): number {
	let sum = 348;
	for (let i = 0x8000; i > 0x8; i >>= 1) {
		sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
	}
	return sum + leapDays(y);
}

// 闰月天数
function leapDays(y: number): number {
	if (leapMonth(y)) {
		return (LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29;
	}
	return 0;
}

// 闰月月份（0=无闰月）
function leapMonth(y: number): number {
	return LUNAR_INFO[y - 1900] & 0xf;
}

// 农历y年m月的天数
function monthDays(y: number, m: number): number {
	return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29;
}

// 公历转农历
function solarToLunar(year: number, month: number, day: number): {
	lunarYear: number; lunarMonth: number; lunarDay: number;
	isLeap: boolean; ganZhi: string; zodiac: string;
	lunarMonthName: string; lunarDayName: string;
	festival: string | null;
} {
	// 计算从1900年1月31日（农历正月初一）到给定日期的天数
	const baseDate = new Date(1900, 0, 31);
	const targetDate = new Date(year, month - 1, day);
	let offset = Math.floor((targetDate.getTime() - baseDate.getTime()) / 86400000);

	// 确定农历年
	let lunarYear = 1900;
	let daysInYear = lunarYearDays(lunarYear);
	while (offset >= daysInYear) {
		offset -= daysInYear;
		lunarYear++;
		daysInYear = lunarYearDays(lunarYear);
	}

	// 确定农历月
	let lunarMonth = 1;
	let isLeap = false;
	const leap = leapMonth(lunarYear);
	let daysInMonth = monthDays(lunarYear, lunarMonth);

	// 先处理正常月份
	for (let i = 1; i <= 12 && offset >= 0; i++) {
		// 闰月处理
		if (leap > 0 && i === leap && !isLeap) {
			--i; // 重复当前月
			isLeap = true;
			daysInMonth = leapDays(lunarYear);
		} else {
			daysInMonth = monthDays(lunarYear, i);
		}

		if (offset < daysInMonth) {
			lunarMonth = i;
			break;
		}
		offset -= daysInMonth;

		if (i === leap && isLeap) {
			isLeap = false;
		}
	}

	const lunarDay = offset + 1;

	// 天干地支年
	const ganZhi = TIANGAN[(lunarYear - 4) % 10] + DIZHI[(lunarYear - 4) % 12];
	const zodiac = ZODIAC[(lunarYear - 4) % 12];
	const lunarMonthName = (isLeap ? '闰' : '') + LUNAR_MONTH[lunarMonth - 1] + '月';
	const lunarDayName = LUNAR_DAY[lunarDay - 1];

	// 节日检查
	let festival: string | null = null;
	const lunarKey = `${lunarMonth}-${lunarDay}`;
	if (LUNAR_FESTIVALS[lunarKey]) {
		festival = LUNAR_FESTIVALS[lunarKey];
	}
	// 也检查公历节日
	const solarKey = `${month}-${day}`;
	if (SOLAR_FESTIVALS[solarKey]) {
		festival = festival || SOLAR_FESTIVALS[solarKey];
	}
	// 除夕特殊处理：腊月最后一天
	if (lunarMonth === 12) {
		const totalDays = monthDays(lunarYear, 12);
		if (lunarDay === totalDays) {
			festival = '🧨 除夕';
		}
	}

	return { lunarYear, lunarMonth, lunarDay, isLeap, ganZhi, zodiac, lunarMonthName, lunarDayName, festival };
}

// ==================== 农历卡片模块 ====================

export class LunarCardModule implements HPageModule {
	id = 'lunar-card';
	name = '农历卡片';
	defaultConfig = {};

	private app: App;
	private container: HTMLElement;

	render(app: App, config: Record<string, any>, container?: HTMLElement): HTMLElement {
		this.app = app;

		this.container = container || document.createElement('div');
		this.container.className = 'jhua-hpage-module jhua-card jhua-lunar-card';
		this.container.dataset.jhuaModule = this.id;
		this.container.empty();

		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth() + 1;
		const day = now.getDate();
		const weekDay = ['日','一','二','三','四','五','六'][now.getDay()];

		const lunar = solarToLunar(year, month, day);

		// 头部
		const header = this.container.createDiv({ cls: 'jhua-card-header' });
		header.createEl('h3', { text: '🏮 农历', cls: 'jhua-card-title' });

		// 公历日期
		const solarDate = this.container.createDiv({ cls: 'jhua-lunar-solar-date' });
		solarDate.createEl('span', { text: `${year}年${month}月${day}日`, cls: 'jhua-lunar-solar-text' });
		solarDate.createEl('span', { text: `星期${weekDay}`, cls: 'jhua-lunar-weekday' });

		// 农历日期（大号）
		const lunarMain = this.container.createDiv({ cls: 'jhua-lunar-main' });
		lunarMain.createEl('span', { text: lunar.lunarDayName, cls: 'jhua-lunar-day-name' });

		// 农历月 + 年
		const lunarSub = this.container.createDiv({ cls: 'jhua-lunar-sub' });
		lunarSub.createEl('span', { text: lunar.lunarMonthName, cls: 'jhua-lunar-month-name' });

		// 天干地支 + 生肖
		const ganZhiLine = this.container.createDiv({ cls: 'jhua-lunar-ganzhi' });
		ganZhiLine.createEl('span', { text: `${lunar.ganZhi}年`, cls: 'jhua-lunar-ganzhi-text' });
		ganZhiLine.createEl('span', { text: `🐉 ${lunar.zodiac}年`, cls: 'jhua-lunar-zodiac' });

		// 节日/节气（如果有）
		if (lunar.festival) {
			const festivalEl = this.container.createDiv({ cls: 'jhua-lunar-festival' });
			festivalEl.createEl('span', { text: lunar.festival, cls: 'jhua-lunar-festival-text' });
		}

		return this.container;
	}

	update(config: Record<string, any>): void {
		this.render(this.app, config, this.container);
	}
}
