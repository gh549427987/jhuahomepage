import { App, Notice } from 'obsidian';
import { HPageModule } from '../types';

// 天气数据结构 (Open-Meteo API)
interface WeatherData {
	temperature: number;
	windspeed: number;
	weathercode: number;
	humidity: number;
	apparent_temperature: number;
	daily_max: number;
	daily_min: number;
	daily_weathercode: number;
}

// WMO天气代码 → 中文描述 + emoji
function getWeatherInfo(code: number): { desc: string; emoji: string } {
	const map: Record<number, { desc: string; emoji: string }> = {
		0: { desc: '晴', emoji: '☀️' },
		1: { desc: '大部晴朗', emoji: '🌤️' },
		2: { desc: '多云', emoji: '⛅' },
		3: { desc: '阴天', emoji: '☁️' },
		45: { desc: '雾', emoji: '🌫️' },
		48: { desc: '霜雾', emoji: '🌫️' },
		51: { desc: '小毛毛雨', emoji: '🌦️' },
		53: { desc: '毛毛雨', emoji: '🌦️' },
		55: { desc: '大毛毛雨', emoji: '🌧️' },
		61: { desc: '小雨', emoji: '🌧️' },
		63: { desc: '中雨', emoji: '🌧️' },
		65: { desc: '大雨', emoji: '🌧️' },
		71: { desc: '小雪', emoji: '🌨️' },
		73: { desc: '中雪', emoji: '🌨️' },
		75: { desc: '大雪', emoji: '❄️' },
		77: { desc: '雪粒', emoji: '🌨️' },
		80: { desc: '阵雨', emoji: '🌦️' },
		81: { desc: '中阵雨', emoji: '🌧️' },
		82: { desc: '大阵雨', emoji: '⛈️' },
		85: { desc: '小阵雪', emoji: '🌨️' },
		86: { desc: '大阵雪', emoji: '❄️' },
		95: { desc: '雷暴', emoji: '⛈️' },
		96: { desc: '冰雹雷暴', emoji: '⛈️' },
		99: { desc: '大冰雹雷暴', emoji: '⛈️' },
	};
	return map[code] || { desc: '未知', emoji: '🌡️' };
}

export class WeatherCardModule implements HPageModule {
	id = 'weather-card';
	name = '天气预报卡片';
	defaultConfig = {
		latitude: 23.16,  // 佛山南海区里水镇
		longitude: 113.15,
		locationName: '里水镇',
	};

	private app: App;
	private container: HTMLElement;
	private config: any;
	private weatherData: WeatherData | null = null;
	private lastFetchTime: number = 0;
	private static CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存

	async render(app: App, config: Record<string, any>, container?: HTMLElement): Promise<HTMLElement> {
		this.app = app;
		this.config = config;

		this.container = container || document.createElement('div');
		this.container.className = 'jhua-hpage-module jhua-card jhua-weather-card';
		this.container.dataset.jhuaModule = this.id;
		this.container.empty();

		// 头部
		const header = this.container.createDiv({ cls: 'jhua-card-header' });
		header.createEl('h3', { text: '🌤️ 天气预报', cls: 'jhua-card-title' });
		const locName = config.locationName || '未设置';
		header.createEl('span', { text: locName, cls: 'jhua-weather-location' });

		// 内容区
		const content = this.container.createDiv({ cls: 'jhua-weather-content' });

		// 检查缓存是否有效
		if (this.weatherData && (Date.now() - this.lastFetchTime) < WeatherCardModule.CACHE_DURATION) {
			this.renderWeather(content, this.weatherData);
		} else {
			content.createEl('div', { text: '加载中...', cls: 'jhua-card-empty' });
			this.fetchWeather(config, content);
		}

		return this.container;
	}

	private async fetchWeather(config: any, contentEl: HTMLElement): Promise<void> {
		try {
			const lat = config.latitude || 23.16;
			const lon = config.longitude || 113.15;
			
			// 使用 Open-Meteo API（完全免费，无需API Key）
			const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Asia%2FShanghai&forecast_days=1`;
			
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			
			const data = await response.json();
			
			this.weatherData = {
				temperature: data.current?.temperature_2m ?? 0,
				windspeed: data.current?.wind_speed_10m ?? 0,
				weathercode: data.current?.weather_code ?? 0,
				humidity: data.current?.relative_humidity_2m ?? 0,
				apparent_temperature: data.current?.apparent_temperature ?? 0,
				daily_max: data.daily?.temperature_2m_max?.[0] ?? 0,
				daily_min: data.daily?.temperature_2m_min?.[0] ?? 0,
				daily_weathercode: data.daily?.weather_code?.[0] ?? 0,
			};
			this.lastFetchTime = Date.now();

			contentEl.empty();
			this.renderWeather(contentEl, this.weatherData);
		} catch (e) {
			contentEl.empty();
			contentEl.createEl('div', { 
				text: `获取天气失败: ${e.message || '网络错误'}`, 
				cls: 'jhua-card-empty',
				attr: { style: 'color: var(--text-error);' }
			});
			// 显示刷新按钮
			const retryBtn = contentEl.createEl('button', { text: '🔄 重试', cls: 'jhua-weather-retry-btn' });
			retryBtn.addEventListener('click', () => {
				contentEl.empty();
				contentEl.createEl('div', { text: '加载中...', cls: 'jhua-card-empty' });
				this.fetchWeather(this.config, contentEl);
			});
		}
	}

	private renderWeather(contentEl: HTMLElement, data: WeatherData): void {
		const current = getWeatherInfo(data.weathercode);
		const daily = getWeatherInfo(data.daily_weathercode);

		// 主温度
		const mainTemp = contentEl.createDiv({ cls: 'jhua-weather-main' });
		mainTemp.createEl('span', { text: current.emoji, cls: 'jhua-weather-emoji' });
		const tempNum = mainTemp.createEl('span', { text: `${Math.round(data.temperature)}°`, cls: 'jhua-weather-temp' });

		// 天气描述
		const desc = contentEl.createDiv({ cls: 'jhua-weather-desc' });
		desc.setText(`${current.desc}`);

		// 体感温度
		const feelsLike = contentEl.createDiv({ cls: 'jhua-weather-detail' });
		feelsLike.setText(`🤒 体感 ${Math.round(data.apparent_temperature)}°C`);

		// 今日高低温
		const hl = contentEl.createDiv({ cls: 'jhua-weather-detail' });
		hl.setText(`📊 ${Math.round(data.daily_min)}° / ${Math.round(data.daily_max)}°C`);

		// 湿度 + 风速
		const extras = contentEl.createDiv({ cls: 'jhua-weather-extras' });
		extras.createEl('span', { text: `💧 ${data.humidity}%`, cls: 'jhua-weather-extra-item' });
		extras.createEl('span', { text: `💨 ${Math.round(data.windspeed)} km/h`, cls: 'jhua-weather-extra-item' });

		// 数据来源
		const source = contentEl.createDiv({ cls: 'jhua-weather-source' });
		source.setText('Open-Meteo');
	}
}
