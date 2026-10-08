# Snowflake Connection Setup Instructions (RunQL)

This guide covers:
1. What info you need to create a connection to Snowflake.
2. Creating a private/public key pair.
3. Setting the public key on your Snowflake user.
4. Getting JDBC/ODBC or TOML connection details from Snowflake.
5. Mapping that data into RunQL.

## 1) What you need to connect to Snowflake

Snowflake details:
- `account`
- `user`
- `warehouse`
- `database`
- `schema`

and the path to your private key file (e.g. `rsa_key.p8`).

## 2) Generate a Snowflake key pair

Use OpenSSL to generate a PKCS8 private key and public key.

### Create your private and public key files

```bash
# Private key (PKCS8, encrypted)
openssl genrsa 2048 | openssl pkcs8 -topk8 -v2 aes-256-cbc -inform PEM -out rsa_key.p8

# Public key
openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub
```
Ensure you keep private key files secure and out of source control.

### Convert `rsa_key.pub` to one-line base64 value

```bash
# macOS/Linux - use this base64 output for the next step
openssl rsa -in rsa_key.p8 -pubout -outform DER | base64 | tr -d '\n'
```
Copy the output value and paste it into the SQL command in Snowflake (see next step).

### Run Snowflake SQL

```sql
ALTER USER <YOUR_SNOWFLAKE_USERNAME>
SET RSA_PUBLIC_KEY='<PASTE_PUBLIC_KEY_BASE64_HERE>';
```

## 3) Get JDBC/ODBC connection details OR TOML connection config from Snowflake

In Snowflake, click on your user image (initials or your picture) in the bottom left corner. Hover over the Snowflake Account id, then click on "View account details".

1. Click the Connectors/Drivers tab.
2. Select ODBC or JDBC in the dropdown.
3. Select the warehouse and database in the dropdowns.
4. Click copy to clipboard.
5. Paste the string into the RunQL Snowflake "Import Connection Settings" field.
6. Click Parse and Fill.

Example JDBC:

```text
jdbc:snowflake://ABCDEFG-XY12345.snowflakecomputing.com/?user=User1&warehouse=COMPUTE_WH&db=JAFFLE_SHOP&schema=PUBLIC&authenticator=externalbrowser
```

You can optionally use the TOML connection config. Just ensure you select the warehouse and database in the dropdowns before clicking copy to clipboard.

## 5) Enter details in RunQL

1. Paste the JDBC/ODBC string OR TOML config file text into the RunQL Snowflake "Import Connection Settings" field.
2. Click Parse and Fill.
3. Click on the Auth tab.
4. Add your Snowflake username.
5. Browse to your private key location.
6. Add your passphrase for the private key.
7. Select your credential storage option (session, or encrypted on disk).
8. Click test connection.
9. Click save.
