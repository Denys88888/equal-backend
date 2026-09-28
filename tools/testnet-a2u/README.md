# Testnet A2U — разблокировка mainnet-кошелька Equal

## Зачем

Оплата в Equal не проходит, потому что у **Mainnet-приложения нет кошелька**
(Developer Portal → App Info → *Connected Outgoing Wallet: None*). Без него Pi
не проводит mainnet-платежи.

Форма получения кошелька (Configuration → App Wallets) заблокирована:

> The paired Testnet app needs App to User transactions to 5 unique wallets.

То есть парное **Testnet**-приложение Equal должно отправить тестовые π пяти
разным пользователям. Этот инструмент делает эти 5 переводов — и ничего больше.
Он никогда не деплоится: запускается локально, один раз.

## Защита от отправки настоящих π

Сеть платежа определяется тем, к какому приложению привязан API-ключ, а не
кодом. Поэтому если по ошибке вставить ключ Mainnet-приложения, Pi создаст
настоящий платёж. Три независимые защиты (каждая проверена тестом, который
падает, если защиту убрать):

1. кошелёк приложения обязан существовать в **Pi Testnet** — иначе отказ до любых действий;
2. если Pi создал платёж не в `Pi Testnet` — он **отменяется**, ничего не подписывается;
3. транзакция всегда собирается под Testnet-сеть и отправляется в Testnet Horizon.

Сумма — 0.01 тестового π, потолок — 1.

## Шаги

### 1. Портал: Testnet-приложение Equal (на телефоне)

В Develop открой парное приложение (*Linked App → Equal · Testnet*):

- **App Wallets** — подключи testnet-кошелёк приложения. Тестовые π бесплатные;
  пополнить можно из Pi Wallet (Testnet).
- **API Key** — сгенерируй ключ именно testnet-приложения.
- **App Info → URL** и **Domain** — адрес, где будет лежать страница из `public/`, и
  верификация домена через `validation-key.txt` testnet-приложения.

### 2. Страница для тестировщиков (`public/`)

`public/index.html` выкладывается по URL testnet-приложения рядом с его
`validation-key.txt`. Человек открывает её в Pi Browser, входит через Pi и
видит свой ID с кнопкой «Скопировать».

### 3. Ключи — только локально

Создай файл `tools/testnet-a2u/.env.testnet` (он в `.gitignore`):

```
PI_TESTNET_API_KEY=ключ_testnet_приложения
PI_TESTNET_WALLET_SEED=S...секретный_ключ_testnet_кошелька
```

**Не присылай их в чат.** Проверка, что всё подключено:

```bash
cd ~/equal-backend/tools/testnet-a2u
npm install
node payout.mjs check
```

Должно показать адрес кошелька, баланс в Pi Testnet и `progress: 0/5`.

### 4. Пять человек

Пять **разных** Pi-аккаунтов открывают страницу в Pi Browser, входят и
присылают свой ID. Затем:

```bash
node payout.mjs send ID1 ID2 ID3 ID4 ID5
```

Прогресс сохраняется в `payouts.log.json` — повторный запуск не заплатит одному
человеку дважды, и один человек засчитывается один раз.

Если Pi пишет, что у пользователя есть незавершённый платёж:

```bash
node payout.mjs incomplete        # список зависших
node payout.mjs cancel <paymentId>
```

### 5. Mainnet-кошелёк

После 5/5 форма в Mainnet-приложении (Configuration → App Wallets)
разблокируется. В поле **Reason for applying** (176 из 180 символов):

```
Equal is a dating app on Pi Mainnet. Users pay Pi for event tickets, paid questions and extra matches. We need an app wallet to receive these payments and refund cancellations.
```

Privacy Policy и Terms уже заполнены верно (`/#/privacy`, `/#/terms` —
приложение на HashRouter, страницы существуют). Submit → ждать одобрения Pi.
После подключения кошелька оплата заработает — проверь на реальном платеже.

## Тесты

```bash
node --test
```

## Хостинг страницы — Render Static Site

Render → **New → Static Site** → репозиторий `Denys88888/equal-backend`, ветка `main`:

| Поле | Значение |
|---|---|
| Name | `equal-testnet` |
| Root Directory | *(пусто)* |
| Build Command | `echo ok` |
| Publish Directory | `tools/testnet-a2u/public` |

Адрес будет `https://equal-testnet.onrender.com` (если имя занято, Render
добавит суффикс — брать тот адрес, что он покажет). Его и ставим как URL
Testnet-приложения в портале. Сборки нет, план бесплатный.
