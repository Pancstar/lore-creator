export type Language = "auto" | "en" | "tr";

type Strings = Record<string, string>;

const en: Strings = {
	"plugin.name": "PancstaR Lore Creator",
	"plugin.loaded": "PancstaR Lore Creator loaded",

	"view.timeline": "Timeline",
	"view.laws": "Laws",
	"view.drafts": "Drafts",
	"view.dashboard": "Dashboard",

	"view.placeholder": "Not built yet — coming in a later phase.",
	"view.timeline.hint": "Story fragments placed on branching timelines will be drawn here.",
	"view.laws.hint": "Universe-wide laws and entity-specific rules will be listed here.",
	"view.drafts.hint": "Sketches, concepts and unused ideas will be collected here.",
	"view.dashboard.hint": "Unfinished fragments and universe status will be summarised here.",

	"settings.title": "PancstaR Lore Creator",
	"settings.language": "Language",
	"settings.language.desc": "Interface language. 'Automatic' follows Obsidian's own language.",
	"settings.language.auto": "Automatic",
	"settings.language.en": "English",
	"settings.language.tr": "Türkçe",

	"settings.folders": "Folders and files",
	"settings.universeFile": "Universe file",
	"settings.universeFile.desc": "Root note holding the universe name and calendar definition.",
	"settings.systemFolder": "System folder",
	"settings.systemFolder.desc": "Holds the schema, type registry and AI brief.",
	"settings.versionsFolder": "Versions folder",
	"settings.versionsFolder.desc": "Older versions of notes are stored here. Never deleted automatically.",
	"settings.templatesFolder": "Templates folder",
	"settings.templatesFolder.desc": "Per-type note templates.",

	"settings.calendar": "Calendar",
	"settings.calendar.desc":
		"Calendar settings are stored in the universe file, not in plugin settings — so the universe definition survives even if this plugin is removed.",
	"settings.calendar.missing": "Universe file not found. Create it to edit calendar settings.",
	"settings.calendar.name": "Calendar name",
	"settings.calendar.namePlaceholder": "e.g. Xen Calendar",
	"settings.calendar.unit": "Unit name",
	"settings.calendar.unitPlaceholder": "e.g. Year, Cycle",
	"settings.calendar.epoch": "Calendar epoch",
	"settings.calendar.epoch.desc": "The zero point of your calendar, as a `time` value.",
	"settings.calendar.earthEpoch": "Earth equivalent of epoch",
	"settings.calendar.earthEpoch.desc": "Which Earth year the epoch corresponds to. Leave blank to disable conversion.",
	"settings.calendar.ratio": "Earth years per unit",
	"settings.calendar.ratio.desc": "How many Earth years one unit of your calendar spans.",
	"settings.calendar.preview": "Preview",

	"settings.display": "Display",
	"settings.showEarthTime": "Show Earth time",
	"settings.showEarthTime.desc": "Display the Earth-time reference next to in-universe dates.",

	"command.openTimeline": "Open timeline",
	"command.openLaws": "Open laws",
	"command.openDrafts": "Open drafts",
	"command.openDashboard": "Open dashboard",

	"notice.universeMissing": "Universe file not found: {0}",
	"notice.saved": "Saved",
};

const tr: Strings = {
	"plugin.name": "PancstaR Lore Creator",
	"plugin.loaded": "PancstaR Lore Creator yüklendi",

	"view.timeline": "Zaman Çizgisi",
	"view.laws": "Yasalar",
	"view.drafts": "Taslaklar",
	"view.dashboard": "Pano",

	"view.placeholder": "Henüz yapılmadı — ilerideki bir fazda gelecek.",
	"view.timeline.hint": "Zaman çizgilerine yerleştirilen hikaye parçaları burada çizilecek.",
	"view.laws.hint": "Evren geneli yasalar ve varlığa özel kurallar burada listelenecek.",
	"view.drafts.hint": "Eskizler, konseptler ve kullanılmamış fikirler burada toplanacak.",
	"view.dashboard.hint": "Yarım kalan parçalar ve evrenin durumu burada özetlenecek.",

	"settings.title": "PancstaR Lore Creator",
	"settings.language": "Dil",
	"settings.language.desc": "Arayüz dili. 'Otomatik' Obsidian'ın kendi dilini takip eder.",
	"settings.language.auto": "Otomatik",
	"settings.language.en": "English",
	"settings.language.tr": "Türkçe",

	"settings.folders": "Klasörler ve dosyalar",
	"settings.universeFile": "Evren dosyası",
	"settings.universeFile.desc": "Evrenin adını ve takvim tanımını tutan kök not.",
	"settings.systemFolder": "Sistem klasörü",
	"settings.systemFolder.desc": "Şema, tür listesi ve AI brief burada durur.",
	"settings.versionsFolder": "Sürümler klasörü",
	"settings.versionsFolder.desc": "Notların eski sürümleri burada saklanır. Kendiliğinden asla silinmez.",
	"settings.templatesFolder": "Şablonlar klasörü",
	"settings.templatesFolder.desc": "Türe göre not şablonları.",

	"settings.calendar": "Takvim",
	"settings.calendar.desc":
		"Takvim ayarları eklenti ayarlarında değil, evren dosyasında saklanır — eklenti kaldırılsa bile evren tanımı vault'ta kalsın diye.",
	"settings.calendar.missing": "Evren dosyası bulunamadı. Takvim ayarlarını düzenlemek için önce onu oluştur.",
	"settings.calendar.name": "Takvim adı",
	"settings.calendar.namePlaceholder": "örn. Xen Takvimi",
	"settings.calendar.unit": "Birim adı",
	"settings.calendar.unitPlaceholder": "örn. Yıl, Çevrim",
	"settings.calendar.epoch": "Takvimin sıfır noktası",
	"settings.calendar.epoch.desc": "Takviminin başlangıcı, `time` değeri olarak.",
	"settings.calendar.earthEpoch": "Sıfır noktasının Dünya karşılığı",
	"settings.calendar.earthEpoch.desc": "O noktanın hangi Dünya yılına denk geldiği. Boş bırakırsan çevrim kapanır.",
	"settings.calendar.ratio": "Birim başına Dünya yılı",
	"settings.calendar.ratio.desc": "Takviminin bir birimi kaç Dünya yılı eder.",
	"settings.calendar.preview": "Önizleme",

	"settings.display": "Görünüm",
	"settings.showEarthTime": "Dünya zamanını göster",
	"settings.showEarthTime.desc": "Evren içi tarihlerin yanında Dünya zamanı referansını göster.",

	"command.openTimeline": "Zaman çizgisini aç",
	"command.openLaws": "Yasaları aç",
	"command.openDrafts": "Taslakları aç",
	"command.openDashboard": "Panoyu aç",

	"notice.universeMissing": "Evren dosyası bulunamadı: {0}",
	"notice.saved": "Kaydedildi",
};

const TABLES: Record<Exclude<Language, "auto">, Strings> = { en, tr };

export class I18n {
	private table: Strings = en;

	setLanguage(language: Language, obsidianLocale: string) {
		const resolved = language === "auto" ? this.detect(obsidianLocale) : language;
		this.table = TABLES[resolved] ?? en;
	}

	/** Falls back to English for any locale we do not ship strings for. */
	private detect(obsidianLocale: string): Exclude<Language, "auto"> {
		const base = obsidianLocale.toLowerCase().split("-")[0];
		return base in TABLES ? (base as Exclude<Language, "auto">) : "en";
	}

	t(key: string, ...args: string[]): string {
		const template = this.table[key] ?? en[key] ?? key;
		return args.reduce((text, arg, i) => text.replace(`{${i}}`, arg), template);
	}
}
