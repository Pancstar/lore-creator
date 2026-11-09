/**
 * Rehberin Türkçe metni. İlkokul çocuğunun da anlayacağı biçimde: kısa
 * cümleler, gündelik sözcükler, her seferinde tek bir fikir. Her fikir için
 * her yerde aynı benzetme kullanılır:
 * evren = raflı bir dolap, not = bir sayfa, zaman çizgisi = çamaşır ipi,
 * akış = bir yol, sonraki/önceki = sayfalar arası oklar, sürüm = çekmecedeki
 * eski taslak, sürüm seti = ayraç, yasa = evreninin bir kuralı,
 * taslak = yapışkan not.
 * Not: "senin dünyan" yerine her zaman "evrenin" denir; "Dünya" yalnız gezegendir.
 */
export const guideTr: Record<string, string> = {
	// Çerçeve
	"guide.back": "← {0}",
	"guide.next": "{0} →",
	"guide.progress": "Bölüm {0} / {1} · yaklaşık {2} dk",
	"guide.curious": "Merak edenler için",
	"guide.faq.search": "Soru bulmak için bir sözcük yaz…",
	"guide.faq.empty": "Buna uyan bir soru yok. Daha kısa bir sözcük dene.",
	"guide.badge.example": "örnek",
	"guide.group.start": "Başlarken",
	"guide.group.writing": "Yazarken",
	"guide.group.tracking": "Takip",
	"guide.group.help": "Yardım",

	// Düğmeler
	"guide.action.createExample": "Örnek bir hikâye oluştur",
	"guide.action.removeExample": "Örnek hikâyeyi kaldır",
	"guide.action.setup": "Evrenimi kur",
	"guide.action.timeSystem": "Zamanımı ayarla",
	"guide.action.newNote": "Yeni bir not yaz",
	"guide.action.openTimeline": "Zaman çizgisini aç",
	"guide.action.openDashboard": "Panoyu aç",
	"guide.action.openRelations": "İlişkileri aç",

	// 1. Giriş
	"guide.intro.title": "Lore Creator nedir?",
	"guide.intro.1":
		"Bir hikâye yazarken çok şey olur. Kişiler, yerler, olaylar vardır. Hepsini aklında tutmak zordur.",
	"guide.intro.2":
		"Lore Creator bunları senin için düzenli tutar. Her şeyi ayrı bir sayfaya yazarsın. Eklenti sayfaları sıraya dizer, böylece neyin ne zaman olduğunu görürsün.",
	"guide.intro.3":
		"Bugün her şeyi öğrenmen gerekmiyor. Bir bölüm oku, dene, daha fazlasını istediğinde geri gel.",
	"guide.intro.tip": "Bunu, sayfalarını kendi kendine sıralayan büyük bir defter gibi düşün.",
	"guide.intro.example":
		"Önce biraz etrafa bakmak mı istersin? Küçük bir örnek hikâye oluştur. Kendi klasörüne gider, senin sayfalarına hiç karışmaz. Tek düğmeyle kaldırabilirsin.",
	"guide.intro.exampleThere":
		"✅ Örnek hikâye vault'unda duruyor. Görmek için zaman çizgisini aç ve \"Fener Bekçileri\"ni seç.",

	// 2. Kurulum
	"guide.setup.title": "Evrenini kur",
	"guide.setup.1":
		"Her hikâyenin bir dünyası vardır. Biz ona evren diyoruz. Evrenin bir dolap gibidir. Rafları vardır: biri kişiler, biri yerler, biri olaylar için ve daha fazlası.",
	"guide.setup.2":
		"Aşağıdaki düğmeye bas. Önce açacağı her klasörü ve sayfayı sana gösterir. Ancak sen \"evet\" deyince oluşturur.",
	"guide.setup.done": "✅ Evrenin zaten kurulu. Bu adımı geçebilirsin.",
	"guide.setup.tip": "Daha önce yazdığın hiçbir şey silinmez ya da değişmez. Eklenti yalnız yeni klasör ve sayfa ekler.",

	// 3. Zaman
	"guide.time.title": "Zamanın",
	"guide.time.1":
		"Evrenin Dünya yıllarını kullanmak zorunda değil. Belki orada bir yıl 400 gündür. Belki insanlar \"devir\" diye sayar. Hiç sorun değil.",
	"guide.time.2":
		"Burada eklentiye evreninde zamanın nasıl işlediğini söylersin: yıllara ne dendiğini ve bir yılın kaç gün olduğunu.",
	"guide.time.3":
		"İstersen evrenini Dünya'ya da bağlayabilirsin. O zaman her tarihin yanında Dünya yılı da görünür.",
	"guide.time.tip": "Emin değil misin? 365 günü bırak. İstediğin zaman değiştirebilirsin, tarihlerin aynı günde kalır.",
	"guide.time.curious":
		"Her not zamanını 7.27 gibi tek bir sayı olarak saklar. Tam kısmı yıldır, gerisi yılın ne kadarının geçtiğidir. Zaman ayarları evren notunda time-name, time-unit, time-days, time-earth-epoch ve time-earth-ratio olarak durur.",

	// 4. İlk not
	"guide.firstNote.title": "İlk notun",
	"guide.firstNote.1": "Bir not bir sayfadır. Her sayfa tek bir şeyi anlatır: bir kişi, bir yer, bir olay ya da bir kural.",
	"guide.firstNote.2":
		"Bir not oluştururken onun ne olduğunu seçersin. Eklenti de onu doğru rafa koyar ve üstüne küçük bir şerit ekler.",
	"guide.firstNote.3":
		"Şerit notun ne olduğunu, ne kadar bittiğini ve ne zaman geçtiğini gösterir. Renkli \"Taslak\" rozetine tıklayıp onu yarım ya da tamam yapabilirsin.",
	"guide.firstNote.tip": "Notları Obsidian'ın normal yoluyla da oluşturabilirsin. Eklenti onları yine bulur.",
	"guide.firstNote.curious":
		"Notun türü type (character, place, event, law, draft…), ne kadar bittiği status (draft, partial, done) olarak saklanır.",

	// 5. Zaman çizgisi
	"guide.timeline.title": "Zaman çizgisi",
	"guide.timeline.1":
		"Zaman çizgisi bir çamaşır ipi gibidir. Sayfaların ona zaman sırasıyla asılır: erken olanlar solda, sonrakiler sağda.",
	"guide.timeline.2":
		"Bir sayfa, bir zamanı olunca ipe asılır. Sayfayı aç, şeridindeki zamana tıkla ve bir yıl seç (istersen bir gün de).",
	"guide.timeline.3":
		"Bir sayfayı sağa ya da sola sürükleyerek ne zaman olduğunu değiştirebilirsin. Yukarı ya da aşağı sürüklersen başka bir yola geçer.",
	"guide.timeline.tip": "Zaman çizgisinde kayboldun mu? Araç çubuğundaki \"Ekrana sığdır\" düğmesine bas, her şeyi bir arada gör.",
	"guide.timeline.curious":
		"Bir not zaman çizgisine timeline alanıyla, yoluna flow ile, anına da time ve time-precision (year, date ya da datetime) ile bağlanır.",

	// 6. Akışlar
	"guide.flows.title": "Akışlar (yollar)",
	"guide.flows.1": "Bir hikâyede aynı anda birçok şey olabilir. Kahraman dağdayken köy yanıyor olabilir.",
	"guide.flows.2":
		"Bunların her biri bir yoldur. Bir yola akış diyoruz. Zaman çizgisinde her akış ayrı bir sıradır, böylece yollar yan yana akar.",
	"guide.flows.3": "Bir yol eklemek ya da adını değiştirmek için zaman çizgisinin solundaki adına tıkla.",
	"guide.flows.tip": "İki yol buluşabilir: bir yoldaki sayfayı öbür yoldaki bir sayfaya bağlaman yeter.",
	"guide.flows.curious": "Akışlar zaman çizgisi notunda flows altında id: Ad biçiminde listelenir.",

	// 7. Bağlantılar
	"guide.links.title": "Notları bağlamak",
	"guide.links.1":
		"Sayfalar birbirini oklarla gösterebilir. \"Sonraki\" bu sayfadan sonra ne olduğunu söyler. \"Önceki\" ondan önce ne olduğunu.",
	"guide.links.2":
		"Bağlı her sayfanın altında küçük bir çubuk görürsün. Düğmeleri seni önceki ya da sonraki sayfaya götürür. Bir düğmenin üstüne gelince nereye gittiğini küçük bir haritada görürsün.",
	"guide.links.3": "Bir sayfanın birden fazla \"sonraki\"si olabilir. Hikâye böyle iki yola ayrılır.",
	"guide.links.tip": "Hikâyende kayboldun mu? Okları izle. Seni hep ana yola geri götürürler.",
	"guide.links.curious": "Oklar next ve prev alanlarıdır; her biri [[Fırtına]] gibi bağlantıların listesidir.",

	"guide.relations.title": "Kim kime bağlı",
	"guide.relations.1":
		"Zaman çizgisi neyin ne zaman olduğunu gösterir. İlişkiler ise kimin kimle bir arada olduğunu: kim nerede yaşıyor, kim hangi grupta, kim neye katılıyor.",
	"guide.relations.2":
		"İlişkileri açınca okuduğun not ortada durur, bağlı olduğu her şey çevresinde. Başka bir nota tıklayınca ona geçersin. Bir adım daha öteye bakmak için 2'ye bas.",
	"guide.relations.tip": "Başka notları okurken bir notu ortada tutmak mı istiyorsun? Kilide bas.",
	"guide.relations.curious":
		"Çizgiler her türün bağlantı alanlarından (üyeler, yer, düşmanlar…) ve laws ile breaks-law alanlarından gelir. Türler notunda bir türe yeni bağlantı alanları ekleyebilirsin.",

	// 8. Pano
	"guide.dashboard.title": "Pano: neler bitmedi",
	"guide.dashboard.1": "Yazmak günler sürer. Pano nerede kaldığını gösterir.",
	"guide.dashboard.2":
		"Sayfalarını sayar ve henüz bitmeyenleri listeler. Yarım olanlar önce gelir, çünkü üzerinde çalıştığın sayfalar onlardır.",
	"guide.dashboard.3":
		"En altta bir \"Tutarlılık\" kontrolü var. Açarsan küçük karışıklıkları gösterir; örneğin olmayan bir sayfayı gösteren bir ok.",
	"guide.dashboard.tip": "Bu kontrol yalnız ipucu verir. Senin yerine hiçbir şeyi değiştirmez.",

	// 9. Sürümler
	"guide.versions.title": "Sürümler",
	"guide.versions.1": "Bazen bir sahneyi başka türlü denemek istersin ama eskisini kaybetmekten korkarsın.",
	"guide.versions.2":
		"Yeni bir sürüm oluştur. Eski sayfa bir çekmeceye girer, sen de temiz bir kopyada yazmaya devam edersin. Eskisini istediğin zaman geri çıkarabilirsin.",
	"guide.versions.3":
		"Sürüm seti bir ayraç gibidir. Her sayfanın hangi sürümünün dışarıda olduğunu hatırlar; böylece bütün hikâyeyi tek seferde geri çevirebilirsin.",
	"guide.versions.tip": "Zaman çizgisindeki bir sayfada küçük bir nokta varsa, çekmecede başka sürümleri var demektir.",

	// 10. Yasalar ve fikirler
	"guide.lawsDrafts.title": "Yasalar ve fikirler",
	"guide.lawsDrafts.1":
		"Yasa evreninin bir kuralıdır; örneğin \"büyü ay ışığı ister\". Her yasayı kendi sayfasına yaz.",
	"guide.lawsDrafts.2":
		"Sayfalar hangi yasalara uyduklarını ve hangilerini çiğnediklerini söyleyebilir. Yasalar listesi de her kural için kimin uyduğunu, kimin çiğnediğini gösterir.",
	"guide.lawsDrafts.3":
		"Henüz yeri olmayan bir fikir taslak olabilir. Taslak, kenara yapıştırılmış bir not gibidir. Hazır olunca onu terfi ettir, gerçek bir sayfa olsun.",
	"guide.lawsDrafts.tip": "Bir fikrin nereye ait olduğundan emin değil misin? Onu taslak yap. Sen karar verene kadar güvenle bekler.",
	"guide.lawsDrafts.curious":
		"Sayfalar yasaları laws ve breaks-law ile gösterir. Bir taslak, ait olduğu sayfayı idea-for ile gösterir.",

	// SSS
	"guide.faq.title": "Sorular ve cevaplar",
	"guide.faq.1.q": "Akış nedir?",
	"guide.faq.1.a":
		"Akış, hikâyendeki bir yoldur. İki şey aynı anda farklı yerlerde oluyorsa her biri kendi yolunu alır. Zaman çizgisinde her yol ayrı bir sıradır.",
	"guide.faq.2.q": "Notum neden zaman çizgisinde görünmüyor?",
	"guide.faq.2.a":
		"Bir sayfa ancak bir zaman çizgisine ait olup bir zamanı varsa ipe asılır. Sayfayı aç, şeridindeki zamana tıkla ve bir zaman seç. Birden fazla zaman çizgin varsa, zaman çizgisinin üstünde hangisinin seçili olduğuna da bak.",
	"guide.faq.3.q": "Bitmemiş notlarımı nerede görürüm?",
	"guide.faq.3.a": "Panoyu aç. Hâlâ taslak ya da yarım olan her sayfayı listeler.",
	"guide.faq.4.q": "Zamanı nasıl ayarlarım, takvimimi nasıl değiştiririm?",
	"guide.faq.4.a":
		"Komut paletini aç ve \"Zaman sistemini düzenle\"yi seç ya da 3. bölümdeki düğmeyi kullan. Orada yıllarının adını, kaç gün olduklarını ve Dünya ile bağını ayarlarsın.",
	"guide.faq.5.q": "Bir yıldaki gün sayısını değiştirirsem notlarıma ne olur?",
	"guide.faq.5.a":
		"Eklenti önce sana sorar. \"Günlerini koru\"yu seçersen tarihli her sayfa yeni takvimde de aynı günde kalır. Bir gün artık yoksa, o yılın son gününe taşınır.",
	"guide.faq.6.q": "Sürüm nedir, eski bir sürüme nasıl dönerim?",
	"guide.faq.6.a":
		"Sürüm, bir sayfanın çekmecede saklanan eski bir kopyasıdır. Sayfayı aç ve komut paletinden \"Bu notun sürümleri\"ni seç (ya da varsa başlık şeridindeki sürüm rozetine tıkla). Sonra geri istediğin sürümün yanındaki değiştir düğmesine bas.",
	"guide.faq.7.q": "Sürüm seti nedir?",
	"guide.faq.7.a":
		"Bütün hikâyen için bir ayraç. Her sayfanın hangi sürümünün dışarıda olduğunu hatırlar, böylece hepsini tek seferde geri koyabilirsin.",
	"guide.faq.8.q": "Notumda \"Taslak\" yazıyor. Bu ne demek?",
	"guide.faq.8.a":
		"Sayfanın henüz bitmediği anlamına gelir. Rozete tıklayıp yarım ya da tamam yapabilirsin. Pano bunu neyin kaldığını göstermek için kullanır.",
	"guide.faq.9.q": "Örnek hikâyeyi silebilir miyim?",
	"guide.faq.9.a":
		"Evet. 1. bölüme git ve \"Örnek hikâyeyi kaldır\"a bas. Sayfaları çöp kutusuna gider, yani istersen geri alabilirsin.",
	"guide.faq.10.q": "Eklenti notlarımı kendi kendine siler ya da değiştirir mi?",
	"guide.faq.10.a":
		"Hayır. Sayfa taşıyan, değiştiren ya da silen her şey önce sana tam olarak ne olacağını gösterir ve \"evet\"ini bekler. Silinen sayfalar çöp kutusuna gider.",
	"guide.faq.11.q": "Notlarımdaki özellikler kutusu nereye gitti?",
	"guide.faq.11.a":
		"Hikâye sayfalarında şerit zaten önemli şeyleri gösterir, bu yüzden ortalık sakin kalsın diye kutu orada gizlenir. Her şeyi sağ taraftaki \"Dosya özellikleri\" panelinde görüp düzenleyebilirsin.",
	"guide.faq.12.q": "Kendi dilimde yazabilir miyim?",
	"guide.faq.12.a":
		"Evet. Sayfalarını istediğin dilde yaz. Eklentinin kendisi İngilizce ve Türkçe konuşur; ayarlarından birini seç.",
	"guide.faq.13.q": "Zaman çizgisi ile akış arasındaki fark ne?",
	"guide.faq.13.a":
		"Zaman çizgisi tarihin bütün bir hâlidir. Akış onun içindeki bir yoldur. Çoğu hikâyeye birkaç yolu olan tek bir zaman çizgisi yeter. İkinci bir zaman çizgisi, olayların başka türlü geliştiği \"öteki dünya\" içindir.",
	"guide.faq.14.q": "Bu rehberi nasıl yeniden açarım?",
	"guide.faq.14.a":
		"Soldaki simge çubuğunda kitap simgesine tıkla, komut paletinde \"Rehberi aç\"ı kullan ya da eklentinin ayarlarında Yardım altında bul.",

	// Şemalar
	"guide.diagram.universe": "Evren",
	"guide.diagram.characters": "Kişiler",
	"guide.diagram.places": "Yerler",
	"guide.diagram.events": "Olaylar",
	"guide.diagram.laws": "Yasalar",
	"guide.diagram.time": "zaman →",
	"guide.diagram.laneA": "Kahraman",
	"guide.diagram.laneB": "Köy",
	"guide.diagram.event1": "Fırtına",
	"guide.diagram.event2": "Tırmanış",
	"guide.diagram.event3": "Yangın",
	"guide.diagram.next": "sonraki",
	"guide.diagram.prev": "önceki",
	"guide.diagram.desk": "Masada",
	"guide.diagram.drawer": "Çekmecede",
	"guide.diagram.draft1": "v1",
	"guide.diagram.draft2": "v2",
};
