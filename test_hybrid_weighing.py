import unittest
from hybrid_weighing import estimate_hybrid, estimate_two_photo_ellipse


class PesaBoiCrevatTests(unittest.TestCase):
    def payload(self):
        # A–B = 250 px para uma barra de 50 cm (0,2 cm/px).
        # C–D = 750 px, portanto comprimento corporal = 150 cm.
        return {
            "breed": "Nelore", "size_class": "Médio", "reference_length_cm": 50,
            "reference_start": {"x": 100, "y": 100},
            "reference_end": {"x": 350, "y": 100},
            "body_start": {"x": 100, "y": 400},
            "body_end": {"x": 850, "y": 400},
            "thoracic_measurements_cm": [180, 180], "crevat_k": 10840,
        }

    def test_manual_example_448_34_kg(self):
        result = estimate_hybrid(self.payload())
        self.assertAlmostEqual(result["body_length_cm"], 150.0, places=2)
        self.assertAlmostEqual(result["thoracic_average_cm"], 180.0, places=2)
        self.assertAlmostEqual(result["weight_estimate_kg"], 448.34, places=2)
        self.assertEqual(result["estimate_mode"], "calibrated_photo_plus_tape")

    def test_uses_average_of_two_chest_measurements(self):
        payload = self.payload(); payload["thoracic_measurements_cm"] = [180, 182]
        result = estimate_hybrid(payload)
        self.assertAlmostEqual(result["thoracic_average_cm"], 181.0, places=2)
        self.assertAlmostEqual(result["weight_estimate_kg"], (181 ** 2 * 150) / 10840, places=2)

    def test_rejects_missing_measurements_without_fake_fallback(self):
        payload = self.payload(); payload.pop("thoracic_measurements_cm")
        with self.assertRaisesRegex(ValueError, "duas medidas"):
            estimate_hybrid(payload)

    def test_rejects_invalid_scale_points(self):
        payload = self.payload(); payload["reference_end"] = payload["reference_start"]
        with self.assertRaisesRegex(ValueError, "muito próximos"):
            estimate_hybrid(payload)

    def test_rejects_k_outside_calibration_range(self):
        payload = self.payload(); payload["crevat_k"] = 9000
        with self.assertRaisesRegex(ValueError, "10.800"):
            estimate_hybrid(payload)

    def test_two_photo_ellipse_is_experimental(self):
        result = estimate_two_photo_ellipse(60, 50)
        self.assertGreater(result["estimated_perimeter_cm"], 0)
        self.assertIn("experimental", result["warning"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
