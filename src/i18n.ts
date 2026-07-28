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
	"settings.language.reload": "Reload Obsidian to rename commands and ribbon buttons.",

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

	"status.draft": "Draft",
	"status.partial": "Unfinished",
	"status.done": "Done",

	"banner.changeIcon": "Change icon",
	"banner.cycleStatus": "Change status",
	"banner.editTime": "Edit time",
	"banner.noTime": "No time set",
	"banner.oldVersion": "old version",

	"icon.title": "Choose an icon",
	"icon.emoji": "Emoji",
	"icon.lucide": "Icons",
	"icon.search": "Search…",
	"icon.clear": "Remove icon",
	"icon.noResults": "Nothing matched.",
	"icon.more": "{0} more — narrow the search.",
	"icon.lang": "en",

	"new.title": "New lore note",
	"new.type": "Type",
	"new.name": "Name",
	"new.namePlaceholder": "Note title",
	"new.icon": "Icon",
	"new.folder": "Folder",
	"new.create": "Create",
	"new.nameRequired": "Give the note a name first.",
	"new.exists": "A note already exists at {0}",
	"new.failed": "Could not create the note — see the console for details.",
	"command.newNote": "New lore note",

	"time.title": "Time",
	"time.precision": "Precision",
	"time.precision.desc": "How exact this moment is. The stored value stays a single sortable number either way.",
	"time.precision.year": "Year only",
	"time.precision.date": "Year and day",
	"time.precision.datetime": "Year, day and time",
	"time.start": "Start",
	"time.end": "End",
	"time.hasEnd": "Spans a range",
	"time.hasEnd.desc": "Turn on when this covers a period rather than a single moment.",
	"time.uncertain": "Approximate",
	"time.uncertain.desc": "Drawn with a dashed edge on the timeline.",
	"time.label": "Label",
	"time.label.desc": "What readers see. Generated from the calendar until you edit it.",
	"time.year": "Year",
	"time.day": "Day",
	"time.hour": "Hour",
	"time.minute": "Minute",
	"time.earth": "Earth",
	"time.save": "Save",
	"time.clear": "Clear time",

	"settings.calendar.days": "Days per unit",
	"settings.calendar.days.desc": "How many days one unit of your calendar contains. Used to place dates inside a year.",

	"timeline.parallel": "parallel",
	"timeline.undefined": "no timeline note",
	"timeline.unnamedFlow": "Unassigned",
	"timeline.untimed": "Time unknown",
	"timeline.zoomIn": "Zoom in",
	"timeline.zoomOut": "Zoom out",
	"timeline.fit": "Fit to view",
	"timeline.empty.title": "No timelines yet",
	"timeline.empty.body":
		"Create a note of type Timeline, give it a timeline id, and list its flows. Notes pointing at that id will appear here.",
	"timeline.noNotes.title": "This timeline is empty",
	"timeline.noNotes.body": "No note carries timeline: {0} yet. Set it on a note and give the note a time.",
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
	"settings.language.reload": "Komut ve buton adlarının değişmesi için Obsidian'ı yeniden yükle.",

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

	"status.draft": "Taslak",
	"status.partial": "Yarım",
	"status.done": "Tamam",

	"banner.changeIcon": "Simgeyi değiştir",
	"banner.cycleStatus": "Durumu değiştir",
	"banner.editTime": "Zamanı düzenle",
	"banner.noTime": "Zaman atanmadı",
	"banner.oldVersion": "eski sürüm",

	"icon.title": "Simge seç",
	"icon.emoji": "Emoji",
	"icon.lucide": "İkonlar",
	"icon.search": "Ara…",
	"icon.clear": "Simgeyi kaldır",
	"icon.noResults": "Eşleşen yok.",
	"icon.more": "{0} tane daha var — aramayı daralt.",
	"icon.lang": "tr",

	"new.title": "Yeni lore notu",
	"new.type": "Tür",
	"new.name": "Ad",
	"new.namePlaceholder": "Not başlığı",
	"new.icon": "Simge",
	"new.folder": "Klasör",
	"new.create": "Oluştur",
	"new.nameRequired": "Önce not adı gir.",
	"new.exists": "Şu yolda zaten bir not var: {0}",
	"new.failed": "Not oluşturulamadı — ayrıntı için konsola bak.",
	"command.newNote": "Yeni lore notu",

	"time.title": "Zaman",
	"time.precision": "Hassasiyet",
	"time.precision.desc": "Bu anın ne kadar kesin olduğu. Saklanan değer her hâlükârda tek bir sıralanabilir sayıdır.",
	"time.precision.year": "Sadece yıl",
	"time.precision.date": "Yıl ve gün",
	"time.precision.datetime": "Yıl, gün ve saat",
	"time.start": "Başlangıç",
	"time.end": "Bitiş",
	"time.hasEnd": "Bir aralığa yayılıyor",
	"time.hasEnd.desc": "Tek an değil de bir dönem kaplıyorsa aç.",
	"time.uncertain": "Yaklaşık",
	"time.uncertain.desc": "Zaman çizgisinde kesikli kenarla çizilir.",
	"time.label": "Etiket",
	"time.label.desc": "Okuyucunun gördüğü metin. Sen düzenleyene kadar takvimden üretilir.",
	"time.year": "Yıl",
	"time.day": "Gün",
	"time.hour": "Saat",
	"time.minute": "Dakika",
	"time.earth": "Dünya",
	"time.save": "Kaydet",
	"time.clear": "Zamanı temizle",

	"settings.calendar.days": "Birim başına gün",
	"settings.calendar.days.desc": "Takviminin bir birimi kaç gün içerir. Tarihleri yıl içine yerleştirmek için kullanılır.",

	"timeline.parallel": "paralel",
	"timeline.undefined": "tanım notu yok",
	"timeline.unnamedFlow": "Atanmamış",
	"timeline.untimed": "Zamanı belirsiz",
	"timeline.zoomIn": "Yakınlaştır",
	"timeline.zoomOut": "Uzaklaştır",
	"timeline.fit": "Ekrana sığdır",
	"timeline.empty.title": "Henüz zaman çizgisi yok",
	"timeline.empty.body":
		"Zaman Çizgisi türünde bir not oluştur, bir çizgi kimliği ver ve akışlarını listele. O kimliği gösteren notlar burada belirir.",
	"timeline.noNotes.title": "Bu zaman çizgisi boş",
	"timeline.noNotes.body": "Hiçbir not timeline: {0} taşımıyor. Bir nota bunu ata ve zaman ver.",
};

const TABLES: Record<Exclude<Language, "auto">, Strings> = { en, tr };

export class I18n {
	private table: Strings = en;
	private resolved: Exclude<Language, "auto"> = "en";

	setLanguage(language: Language, obsidianLocale: string) {
		this.resolved = language === "auto" ? this.detect(obsidianLocale) : language;
		this.table = TABLES[this.resolved] ?? en;
	}

	/** The language actually in effect, with "auto" already resolved. */
	get current(): Exclude<Language, "auto"> {
		return this.resolved;
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
