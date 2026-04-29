use eyre::Result;
use hound::WavReader;

pub fn read_wav(file_path: &str) -> Result<(Vec<i16>, u32)> {
    let mut reader = WavReader::open(file_path)?;
    let spec = reader.spec();
    let sample_rate = spec.sample_rate;
    let samples: Vec<i16> = reader.samples::<i16>().collect::<Result<Vec<_>, _>>()?;

    Ok((samples, sample_rate))
}
