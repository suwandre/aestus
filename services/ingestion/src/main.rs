// placeholder — ingestion service implemented in P06
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().json().init();
    tracing::info!("ingestion service placeholder");
    Ok(())
}
