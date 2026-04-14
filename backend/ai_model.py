import io
import logging

from PIL import Image
from transformers import CLIPModel, CLIPProcessor
import torch

logger = logging.getLogger(__name__)

MODEL_NAME = "openai/clip-vit-base-patch32"

PROMPTS = {
    "condensation water drops dripping on interior wall ceiling": "condensacion",
    "rising damp capillarity moisture at base of wall floor": "capilaridad",
    "water infiltration leaking stain damage through wall crack": "filtracion",
}

_model = None
_processor = None


def _load_model():
    global _model, _processor
    if _model is None:
        logger.info("Cargando modelo CLIP desde HuggingFace...")
        _model = CLIPModel.from_pretrained(MODEL_NAME)
        _processor = CLIPProcessor.from_pretrained(MODEL_NAME)
        _model.eval()
        logger.info("Modelo CLIP cargado correctamente.")


def classify_humidity(image_bytes: bytes) -> dict:
    _load_model()

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    texts = list(PROMPTS.keys())
    labels = list(PROMPTS.values())

    inputs = _processor(
        text=texts,
        images=image,
        return_tensors="pt",
        padding=True,
    )

    with torch.no_grad():
        outputs = _model(**inputs)
        logits = outputs.logits_per_image
        probs = logits.softmax(dim=1)[0].tolist()

    max_idx = probs.index(max(probs))
    tipo = labels[max_idx]
    confianza = round(probs[max_idx], 4)

    all_scores = {labels[i]: round(probs[i], 4) for i in range(len(labels))}
    logger.info(f"Scores CLIP: {all_scores}")

    return {"tipo": tipo, "confianza": confianza}