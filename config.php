<?php
/* CepStok sunucu ayarları — kurulumdan sonra bu dosyayı düzenleyebilirsiniz */
return [
    // Veritabanı: 'sqlite' (kurulum gerektirmez) ya da 'mysql' (cPanel > MySQL Veritabanları)
    'db' => 'sqlite',
    'sqlite_path' => __DIR__ . '/data/cepstok.sqlite',
    'mysql' => [
        'host' => 'localhost',
        'name' => 'cpanelkullanici_cepstok',
        'user' => 'cpanelkullanici_cepstok',
        'pass' => '',
    ],
    // Herkes yeni firma kaydı açabilsin mi? Kapatırsanız yalnızca aşağıdaki anahtarı bilen kayıt açar.
    'allow_register' => true,
    'register_key' => '',
    // Döviz kuru kaynağı: Harem Altın, olmazsa TCMB
    'rate_cache_seconds' => 120,
    // Yönetim paneli (yonetim.html): ilk girişte panelden hesap oluşturulur. İsterseniz buradan da sabitleyebilirsiniz.
    'admin_user' => 'yonetici',
    'admin_pass' => '',
    // Deneme süresi, paketler, fiyat tablosu ve WhatsApp numarası yönetim panelinden değiştirilir.
    // Oturum süresi (gün)
    'token_days' => 60,
];
