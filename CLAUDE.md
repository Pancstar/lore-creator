# Proje Kuralları

- Onay almadan uygulamaya geçilmez. Herhangi bir problem/sorun çıkarsa kullanıcıya sorulur.
- Kararlaştırılmamış kısımlar kullanıcıya sorulur, birlikte karara bağlanır, sonra uygulanır.
- Mevcut proje düzeni/yapısı korunur, anlaşma olmadan değiştirilmez.

# GLOBAL AGENT KURALLARI

1.  **Dil ve İletişim:** Planlama dosyalarını ve benimle iletişimi her zaman Türkçe yap. (Özel teknik terimler hariç).
2.  **Kodu Koruma (Non-Destructive Editing):** Bir dosyada değişiklik yaparken SADECE ilgili satırlara müdahale et. Dosyanın geri kalanına ve özellikle mevcut `import` satırlarına ASLA dokunma veya silme.(Müdahale edilmesi gerekiyorsa bildir ve sor!)
3.  **Import Güvenliği:** Yeni bir kütüphane eklerken mevcut `import` satırlarını koru, sadece yenilerini listeye dahil et.
4.  **İnisiyatif Alma ve Sorun Bildirimi:** Kodun çalışmasını bozabilecek, yapısını değiştirecek veya emin olmadığın belirsiz bir durumla karşılaştığında kendi kafana göre işlem yapma. Bir problem bulduğunda önce beni bilgilendir, vereceğim onaya ve yanıta göre ilerle.
5.  **Geliştirme Günlüğü ve Versiyonlama (KATI KURAL):** Eski kayıt dosyalarını ASLA değiştirme, üzerine yazma veya isimlerini değiştirme! Her güncelleme sonrasında versiyonu artır ve `/development-logs/` klasörüne SIFIRDAN YENİ BİR DOSYA ekle (Dosya adı formatı: `vX.Y.Z-kisa-ozet.md`).
    - **Arşivleme Kuralı (Dosya kalabalığını önleme):** Major sürüm (`x.y.z` formatındaki 'x') değiştiğinde (örneğin v1'den v2'ye geçildiğinde), bir önceki major sürüme ait tüm alt log dosyalarını (örneğin v1.0.0'dan v1.9.9'a kadar olan tüm dosyaları) `vx.guncellemeleri.md` adında tek bir dosyada birleştir ve klasördeki o eski küçük parçaları sil.
    - **İçerik Başlıkları:** `### Added:`, `### Changed:`, `### Fixed:`, `### Notes:` formatında olmalıdır.
    - **Dil:** Dosya içerisine yazılan her madde mutlaka hem Türkçe hem de İngilizce olacak şekilde iki dilde de yazılmalıdır.
    - **İnisiyatif:** Sürüm numarasına (Major, Minor, Patch) veya içeriğe ne yazacağına emin değilsen işlem yapmadan önce mutlaka bana sor.
6.  **Lokalizasyon Altyapısı:** Geliştirmelerde ana dil her zaman İngilizce olacak fakat ikinci dil olarak her daim Türkçe ekle. İngilizce ve Türkçe arasında ayrım yapma. İkisine de gerekli özeni göster. Kod mimarisini daha sonra farklı dillere kolayca çevrilebilecek şekilde kurgula.
7. **Proje Durumu ve Yol Haritası Dosyası (KATI KURAL):** Her projenin kök dizininde `STATUS.md` adında bir durum dosyası bulunmalıdır. Bu dosya, projenin anlık durumunu ve yol haritasını tek bir yerden takip edilebilir kılmak için kullanılır. Farklı bir agent veya oturum değiştiğinde bile proje bağlamı korunmalıdır.
    - **Dosya formatı şu bölümlerden oluşmalıdır:**
      - `## 🔄 Devam Edenler (In Progress):` — Şu an aktif olarak üzerinde çalışılan maddeler.
      - `## ✅ Tamamlananlar (Done):` — Başarıyla tamamlanmış işler. (Kısa özet + tarih)
      - `## ❌ İptal Edilenler (Cancelled):` — Vazgeçilen veya gereksiz bulunan maddeler ve kısa gerekçesi.
      - `## 📋 Yapılacaklar (To-Do):` — Planlanmış ama henüz başlanmamış işler, öncelik sırasıyla.
      - `## 💡 Gelecek Fikirler (Future Ideas):` — Uzun vadede düşünülen, henüz kesinleşmemiş özellik veya iyileştirmeler.
    - **Kurallar:**
      - Bu dosya her geliştirme adımının başında okunmalı, sonunda güncellenmelidir.
      - Her madde kısa, net ve Türkçe yazılmalıdır.
      - Tamamlanan maddeler Yapılacaklardan Tamamlananlara taşınmalı, silinmemelidir.
      - Dosyanın en üstünde Son Güncelleme: YYYY-MM-DD tarihi yer almalıdır.
8. **Global Kuralların Projeye Dahil Edilmesi (KATI KURAL):** Bu IDE'de çalışırken ve bu global kurallar varken kurulan veya çalışılan her projenin ana dizinindeki `.cursorrules` dosyasına bu global kurallar tamamen eklenmelidir. (Ayrı bir GEMINI.md dosyasına gerek yoktur). Bu sayede projenin başka bir ortamda kullanılması veya çalıştırılması durumunda kural kaybı yaşanması engellenir.
9. **Planlama Önceliği ve Formatı (KATI KURAL):** Büyük mimari değişiklikler, yeni özellik eklemeleri veya karmaşık kod düzenlemeleri için önce detaylı bir planlama yapılmalı ve bu plan kullanıcıya sunulup onayı alınmalıdır (Planlamalar bir 'Artifact' / özel markdown dokümanı olarak sunulmalıdır). **İstisna (Hızlandırma):** CSS renk değişimi, basit metin/typo düzeltmeleri veya risk taşımayan ufak UI güncellemeleri gibi "minör" görevlerde geliştirme hızını kesmemek adına onay beklemeden doğrudan aksiyon alınabilir.
10. **Strateji Doğrulama Döngüsü (KATI KURAL):** Kritik teknik değişiklikler uygulamaya başlamadan önce agent, belirlediği stratejiden %100 emin olmalıdır. Emin değilse; olası tüm açıkları (loophole) bulmalı, bunlara uygun düzeltmeler önermeli ve bu döngüyü strateji olgusal olarak %100 güvenilir hale gelene kadar tekrarlamalıdır. **İstisna:** Etki alanı dar ve sonucu net olan küçük görevlerde (13. maddedeki istisnalar) bu katı döngü esnetilerek hızlıca koda müdahale edilebilir. Ancak büyük modül yazımlarında kafaya göre kod yazmak kesinlikle yasaktır.
11. **UZAK SUNUCUYA (REMOTE) GERİ DÖNÜŞ YASAĞI (KATI KURAL):**
    Görevleri gerçekleştirirken veya hata kurtarması yaparken ASLA GitHub'dan, uzak (remote) depolardan veya geçmiş commit geçmişinden kod ya da veri çekme. KESİNLİKLE sadece yerel çalışma alanındaki (local workspace) dosyaların en güncel halini kullanmalısın. Eğer yerel bir dosya okunamıyorsa veya bir hata oluşuyorsa, işlemi derhal durdur ve hatayı kullanıcıya bildir. Kendi inisiyatifinle eski koda dönme (revert/restore etme).
12. **TOPLU SİLME VEYA KESME (TRUNCATION) YASAĞI (KATI KURAL):**
    Asla toplu kod silme işlemi yapma. Bir dosyayı düzenlerken veya güncellerken, mevcut görevin kapsamı dışında kalan mevcut kodu ASLA silme, kesme veya kaldırma. Kesinlikle "// ... mevcut kodlar ..." veya "// ... dosyanın geri kalanı ..." gibi yer tutucular (placeholder) KULLANMA. Dosyanın tamamının yapısal bütünlüğünü korumalı ve yalnızca gerekli satırlara nokta atışı değişiklikler uygulamalısın.
13. **SORU-CEVAP VE MUTLAK PLANLAMA/ONAY DÖNGÜSÜ (KATI KURAL):**
    - **Soru ve Aksiyon Ayrımı:** Kullanıcı bir soru sorduğunda (sorgulama, araştırma, açıklama isteme vb.) kesinlikle hiçbir dosya veya kod üzerinde değişiklik/işlem yapmaya başlama. Sadece ve doğrudan sorulan soruyu cevapla. Yalnızca kullanıcı açıkça bir eylem/işlem talimatı verdiğinde ("şunu yap", "şunu değiştir" vb.) işlem sürecini başlat.
    - **Mutlak Planlama ve Onay:** Yapılacak **HER** işlem ve değişiklik için (küçük CSS/UI düzenlemeleri, basit metin düzeltmeleri dahil olmak üzere, Madde 13'teki hızlandırma istisnaları da dahil tüm durumlar için) öncelikle detaylı bir planlama yapmalı ve kullanıcının onayını istemelisin. Kullanıcıdan yazılı ve net onay almadan çalışma alanındaki hiçbir dosyada değişiklik yapma, komut çalıştırma veya eylem başlatma. Bu kuralları mevcut kurallara ekle. ÖNEMLİ!
